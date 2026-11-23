use scraper::{Html, Selector};
use serde_json::Value;
use std::time::Duration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConnectorMode {
    PublicHtml,
    ApprovedApi,
    Unsupported,
}

#[derive(Clone, Copy, Debug)]
pub struct ConnectorProfile {
    pub mode: ConnectorMode,
    pub key: &'static str,
    pub label: &'static str,
}

#[derive(Clone, Debug)]
pub struct NormalizedListing {
    pub source_url: String,
    pub title: String,
    pub employer: String,
    pub location: String,
    pub description: String,
}

pub fn connector_profile(source_id: &str) -> ConnectorProfile {
    match source_id {
        "manual" => ConnectorProfile {
            mode: ConnectorMode::Unsupported,
            key: "manual_import",
            label: "Manual import",
        },
        "linkedin" => ConnectorProfile {
            mode: ConnectorMode::ApprovedApi,
            key: "linkedin_jobs_api",
            label: "LinkedIn Jobs API",
        },
        "indeed" => ConnectorProfile {
            mode: ConnectorMode::ApprovedApi,
            key: "indeed_publisher_api",
            label: "Indeed approved API",
        },
        "wazzuf" => ConnectorProfile {
            mode: ConnectorMode::PublicHtml,
            key: "wuzzuf_html",
            label: "WUZZUF public listings",
        },
        "bayt" => ConnectorProfile {
            mode: ConnectorMode::PublicHtml,
            key: "bayt_html",
            label: "Bayt public listings",
        },
        "fiveamsat" => ConnectorProfile {
            mode: ConnectorMode::PublicHtml,
            key: "khamsat_html",
            label: "Khamsat public services",
        },
        "adzuna" => ConnectorProfile {
            mode: ConnectorMode::ApprovedApi,
            key: "adzuna_api",
            label: "Adzuna API",
        },
        _ => ConnectorProfile {
            mode: ConnectorMode::PublicHtml,
            key: "generic_html",
            label: "Generic public HTML",
        },
    }
}

pub async fn fetch_and_parse(
    url: &str,
    source_id: &str,
    query: &str,
    location: &str,
) -> Result<Vec<NormalizedListing>, String> {
    let profile = connector_profile(source_id);
    if profile.mode == ConnectorMode::ApprovedApi {
        return Err(format!(
            "{} requires an approved API integration ({})",
            profile.label, profile.key
        ));
    }

    let client = reqwest::Client::builder()
        .user_agent("JOBS.wasfai.com/0.1 (+https://jobs.wasfai.com/connectors)")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("build connector client: {error}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("fetch source: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("source returned HTTP {}", response.status()));
    }
    let html = response
        .text()
        .await
        .map_err(|error| format!("read source response: {error}"))?;
    Ok(parse_job_listings(&html, url, query, location))
}

fn parse_job_listings(
    html: &str,
    source_url: &str,
    query: &str,
    location: &str,
) -> Vec<NormalizedListing> {
    let document = Html::parse_document(html);
    let json_ld_selector =
        Selector::parse("script[type=\"application/ld+json\"]").expect("valid JSON-LD selector");
    let mut listings = Vec::new();

    for node in document.select(&json_ld_selector) {
        let json = node.inner_html();
        if let Ok(value) = serde_json::from_str::<Value>(&json) {
            collect_json_ld_listings(&value, source_url, query, location, &mut listings);
        }
    }

    if listings.is_empty() {
        let card_selector = Selector::parse("article, [data-job], .job-card, .job, li")
            .expect("valid job card selector");
        let heading_selector =
            Selector::parse("h1, h2, h3, [class*=\"title\"]").expect("valid heading selector");
        let link_selector = Selector::parse("a[href]").expect("valid link selector");
        for card in document.select(&card_selector) {
            let text = clean_text(&card.text().collect::<Vec<_>>().join(" "));
            if text.len() < 12 || !matches_query(&text, query, location) {
                continue;
            }
            let title = card
                .select(&heading_selector)
                .next()
                .map(|node| clean_text(&node.text().collect::<Vec<_>>().join(" ")))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| text.split(" · ").next().unwrap_or(&text).to_string());
            let source_url = card
                .select(&link_selector)
                .next()
                .and_then(|node| node.value().attr("href"))
                .map(|href| absolute_url(source_url, href))
                .unwrap_or_else(|| source_url.to_string());
            listings.push(NormalizedListing {
                source_url,
                title,
                employer: "غير محدد".into(),
                location: location.to_string(),
                description: text,
            });
        }
    }

    listings
}

fn collect_json_ld_listings(
    value: &Value,
    source_url: &str,
    query: &str,
    location: &str,
    listings: &mut Vec<NormalizedListing>,
) {
    match value {
        Value::Array(items) => items
            .iter()
            .for_each(|item| collect_json_ld_listings(item, source_url, query, location, listings)),
        Value::Object(object) => {
            if object
                .get("@type")
                .and_then(Value::as_str)
                .map(|kind| kind.eq_ignore_ascii_case("JobPosting"))
                .unwrap_or(false)
            {
                let title = value_string(object.get("title")).unwrap_or_default();
                let description = value_string(object.get("description")).unwrap_or_default();
                let employer = object
                    .get("hiringOrganization")
                    .and_then(|value| value.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("غير محدد")
                    .to_string();
                let location_value = object
                    .get("jobLocation")
                    .and_then(|value| value.get("address"))
                    .and_then(|value| value.get("addressLocality"))
                    .and_then(Value::as_str)
                    .unwrap_or(location)
                    .to_string();
                if !title.is_empty()
                    && matches_query(
                        &format!("{title} {description} {location_value}"),
                        query,
                        location,
                    )
                {
                    listings.push(NormalizedListing {
                        source_url: value_string(object.get("url"))
                            .unwrap_or_else(|| source_url.to_string()),
                        title,
                        employer,
                        location: location_value,
                        description: clean_text(&description),
                    });
                }
            }
            object.values().for_each(|child| {
                if child.is_array() || child.is_object() {
                    collect_json_ld_listings(child, source_url, query, location, listings);
                }
            });
        }
        _ => {}
    }
}

fn value_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_string)
}

fn matches_query(text: &str, query: &str, location: &str) -> bool {
    let haystack = text.to_lowercase();
    let normalized_query = query.to_lowercase();
    let query_tokens = normalized_query
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| token.len() >= 3)
        .collect::<Vec<_>>();
    let query_match =
        query_tokens.is_empty() || query_tokens.iter().any(|token| haystack.contains(token));
    let location_match = location.trim().is_empty() || haystack.contains(&location.to_lowercase());
    query_match && location_match
}

fn clean_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn absolute_url(base: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if href.starts_with('/') {
        if let Some(origin) = base.split('/').take(3).collect::<Vec<_>>().get(..3) {
            return format!("{}/{href}", origin.join("/"));
        }
    }
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        href.trim_start_matches('/')
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_ld_job_postings_into_normalized_listings() {
        let html = r#"
            <script type="application/ld+json">
              [{
                "@type": "JobPosting",
                "title": "Senior Rust Engineer",
                "description": "Build APIs for a MENA product team.",
                "url": "https://example.com/jobs/rust",
                "hiringOrganization": {"name": "Example Labs"},
                "jobLocation": {"address": {"addressLocality": "Riyadh"}}
              }]
            </script>
        "#;

        let listings = parse_job_listings(html, "example", "Rust", "Riyadh");

        assert_eq!(listings.len(), 1);
        assert_eq!(listings[0].title, "Senior Rust Engineer");
        assert_eq!(listings[0].employer, "Example Labs");
        assert_eq!(listings[0].location, "Riyadh");
    }

    #[test]
    fn filters_html_listings_by_query_and_location() {
        let html = r#"
            <article class="job-card"><h2>Rust Backend Engineer</h2><a href="/rust">Example Labs</a><p>Riyadh</p><div>Rust SQL APIs</div></article>
            <article class="job-card"><h2>Graphic Designer</h2><a href="/design">Design Co</a><p>Dubai</p><div>Brand design</div></article>
        "#;

        let listings = parse_job_listings(html, "example", "Rust", "Riyadh");

        assert_eq!(listings.len(), 1);
        assert_eq!(listings[0].title, "Rust Backend Engineer");
        assert_eq!(parse_job_listings(html, "example", "", "").len(), 2);
    }

    #[test]
    fn connector_capabilities_require_approved_apis_for_linkedin_and_indeed() {
        assert_eq!(
            connector_profile("linkedin").mode,
            ConnectorMode::ApprovedApi
        );
        assert_eq!(connector_profile("indeed").mode, ConnectorMode::ApprovedApi);
        assert_eq!(connector_profile("wazzuf").mode, ConnectorMode::PublicHtml);
        assert_eq!(
            connector_profile("fiveamsat").mode,
            ConnectorMode::PublicHtml
        );
    }
}
