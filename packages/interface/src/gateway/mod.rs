mod handlers;
mod llm_handlers;
mod proxy_handlers;

pub use handlers::{
    google_3d_tiles_proxy, google_3d_tiles_root, mapbox_gateway_proxy, mapbox_geocoding,
    mapbox_proxy, mapbox_public_token_route, sentinel_credentials,
};
pub use llm_handlers::{
    claude_messages, deepseek_chat, gemini_generate_content, openai_chat,
};
pub use proxy_handlers::{graphhopper_proxy, openrouteservice_proxy, openweathermap_proxy};
