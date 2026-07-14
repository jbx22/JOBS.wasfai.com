use mena_job_command_center::app;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3030")
        .await
        .expect("bind prototype server");

    println!("JOBS.wasfai.com prototype: http://127.0.0.1:3030/app");
    axum::serve(listener, app())
        .await
        .expect("serve prototype app");
}
