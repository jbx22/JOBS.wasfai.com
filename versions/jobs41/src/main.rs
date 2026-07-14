use mena_job_command_center::app;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let port = std::env::var("PORT").unwrap_or_else(|_| "3030".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind prototype server");

    println!("JOBS.wasfai.com service listening on 0.0.0.0:{port}");
    axum::serve(listener, app())
        .await
        .expect("serve prototype app");
}
