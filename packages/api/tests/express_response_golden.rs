//! Express response golden verification — optional, requires running Express on :3001.

use reqwest::StatusCode;
use serde_json::Value;

#[derive(Debug)]
struct GoldenCase {
    method: String,
    path: String,
    body: Option<Value>,
    status: u16,
    expect: String,
}

fn golden_path() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../migration/express-response-golden.tsv")
}

fn load_cases() -> Vec<GoldenCase> {
    let raw = std::fs::read_to_string(golden_path()).expect("read express-response-golden.tsv");
    raw.lines()
        .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .map(|line| {
            let parts: Vec<&str> = line.splitn(5, '\t').collect();
            assert_eq!(parts.len(), 5, "bad golden line: {line}");
            GoldenCase {
                method: parts[0].into(),
                path: parts[1].into(),
                body: if parts[2].trim().is_empty() {
                    None
                } else {
                    Some(serde_json::from_str(parts[2]).expect("body json"))
                },
                status: parts[3].parse().expect("status"),
                expect: parts[4].into(),
            }
        })
        .collect()
}

fn sorted_json_keys(value: &Value) -> Vec<String> {
    value
        .as_object()
        .map(|obj| {
            let mut keys: Vec<String> = obj.keys().cloned().collect();
            keys.sort();
            keys
        })
        .unwrap_or_default()
}

fn assert_expect(expect: &str, body_text: &str, json: &Value) {
    if let Some(text) = expect.strip_prefix("text:") {
        assert_eq!(body_text, text, "body text mismatch");
        return;
    }
    if let Some(keys) = expect.strip_prefix("json_keys:") {
        let mut expected: Vec<String> = keys.split(',').map(str::trim).map(str::to_string).collect();
        expected.sort();
        assert_eq!(sorted_json_keys(json), expected, "json keys mismatch");
        return;
    }
    if let Some(field) = expect.strip_prefix("json_has:") {
        assert!(json.get(field).is_some(), "missing field {field} in {json}");
        return;
    }
    panic!("unknown expect format: {expect}");
}

#[tokio::test]
#[ignore = "requires Express on EXPRESS_URL (scripts/verify-express-response-golden.sh)"]
async fn express_response_golden_public_routes() {
    let base = std::env::var("EXPRESS_URL").unwrap_or_else(|_| "http://127.0.0.1:3001".into());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("client");

    if client.get(format!("{base}/health")).send().await.is_err() {
        panic!("Express not reachable at {base}");
    }

    for case in load_cases() {
        let url = format!("{base}{}", case.path);
        let resp = if case.method == "GET" {
            client.get(&url).send().await.expect("get")
        } else {
            client
                .post(&url)
                .json(&case.body.clone().unwrap_or(serde_json::json!({})))
                .send()
                .await
                .expect("post")
        };

        let status = resp.status();
        assert_eq!(
            status,
            StatusCode::from_u16(case.status).expect("golden status"),
            "{} {}",
            case.method,
            case.path
        );

        let body_text = resp.text().await.unwrap_or_default();
        let json: Value = serde_json::from_str(&body_text).unwrap_or(serde_json::json!({}));
        assert_expect(&case.expect, &body_text, &json);
    }
}

#[test]
fn express_response_golden_file_nonempty() {
    let cases = load_cases();
    assert!(
        cases.len() >= 10,
        "expected at least 10 express golden cases, got {}",
        cases.len()
    );
}
