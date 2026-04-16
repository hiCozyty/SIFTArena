use clap::Parser;
use dialoguer::{theme::ColorfulTheme, Input};
use std::fs;
use std::path::Path;

#[derive(Parser, Debug)]
#[command(name = "start")]
#[command(about = "ShadowProtocol setup CLI")]
struct Args {}

fn main() {
    let _args = Args::parse();

    let env_path = Path::new(".env");

    // Check if .env exists and has NVIDIA_API_KEY
    if env_path.exists() {
        if let Ok(content) = fs::read_to_string(env_path) {
            if content.contains("NVIDIA_API_KEY=") {
                println!("ShadowProtocol ready");
                return;
            }
        }
    }

    // Prompt for API key
    let theme = ColorfulTheme::default();
    let api_key: String = Input::with_theme(&theme)
        .with_prompt("Enter your NVIDIA API key")
        .interact_text()
        .unwrap();

    // Prepare .env content
    let env_content = format!(
        "NVIDIA_API_KEY={}\nNVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1\nNVIDIA_MODEL=qwen/qwen3.5-397b-a17b\n",
        api_key.trim()
    );

    // Write to .env
    fs::write(env_path, env_content).expect("Failed to write .env file");

    println!("API key saved to .env");
    println!("ShadowProtocol ready");
}
