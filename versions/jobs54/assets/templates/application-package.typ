#import sys: inputs

#set page(
  paper: "a4",
  margin: (x: 18mm, top: 16mm, bottom: 18mm),
  footer: context align(center)[
    #set text(size: 8pt, fill: rgb("66736f"))
    MENA Job Command Center - #counter(page).display()
  ],
)
#set text(font: "IBM Plex Sans Arabic", size: 10pt, fill: rgb("17211f"), lang: "ar")
#set par(leading: 0.7em, justify: false)
#set list(indent: 1.1em, body-indent: 0.6em, spacing: 0.35em)

#show heading.where(level: 1): it => block(
  width: 100%,
  breakable: false,
  above: 14pt,
  below: 8pt,
  stroke: (top: 0.5pt + rgb("dbe8e4")),
  inset: (top: 8pt),
)[
  #set text(size: 15pt, weight: 600)
  #it.body
]

#show heading.where(level: 2): it => block(
  width: 100%,
  breakable: false,
  above: 9pt,
  below: 4pt,
)[
  #set text(size: 11pt, weight: 600, fill: rgb("0f766e"))
  #it.body
]

#let render-sections(sections) = {
  for section in sections {
    heading(level: 2, outlined: false, section.heading)
    for paragraph in section.paragraphs {
      par()[#paragraph]
    }
    if section.bullets.len() > 0 {
      list(..section.bullets.map(item => [#item]))
    }
  }
}

#align(right)[
  #text(size: 20pt, weight: 600, fill: rgb("0f766e"))[MENA Job Command Center]
  #v(5pt)
  #text(size: 9pt, fill: rgb("66736f"))[
    #inputs.job_title - #inputs.employer \
    #inputs.location | #inputs.pdf_status
  ]

  #heading(level: 1, outlined: false, inputs.resume_title)
  #render-sections(inputs.resume_sections)

  #pagebreak()
  #heading(level: 1, outlined: false, inputs.cover_letter_title)
  #render-sections(inputs.cover_letter_sections)

  #v(10pt)
  #text(size: 8pt, fill: rgb("66736f"))[Generated: #inputs.generated_at]
]
