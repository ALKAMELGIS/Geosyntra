//! GeoSyntra API binary — Axum HTTP server (default `:3003`).

use std::net::SocketAddr;
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    geosyntra_api::local_env::load_envrc_local();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    let port: u16 = std::env::var("GEOSYNTRA_API_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3003);

    let bind_host = std::env::var("GEOSYNTRA_BIND_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let addr: SocketAddr = format!("{bind_host}:{port}")
        .parse()
        .expect("invalid GEOSYNTRA_BIND_HOST or GEOSYNTRA_API_PORT");

    let app = match std::env::var("DATABASE_URL") {
        Ok(url) => {
            tracing::info!("Preparing database (migrations + owner bootstrap)…");
            geosyntra_api::router_with_static_from_database_url(&url)
                .await
                .expect("failed to prepare DATABASE_URL — check Postgres and env")
        }
        Err(_) => {
            tracing::warn!("DATABASE_URL unset — serving /health only");
            geosyntra_api::health_router()
        }
    };

    let listener = match TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(err) if err.kind() == std::io::ErrorKind::AddrInUse => {
            panic!(
                "bind failed: {addr} already in use ({err}). Stop the other geosyntra-api process or set GEOSYNTRA_API_PORT."
            );
        }
        Err(err) => panic!("bind failed on {addr}: {err}"),
    };

    tracing::info!("GeoSyntra API listening on http://{addr}");
    axum::serve(listener, app).await.expect("server failed");
}
