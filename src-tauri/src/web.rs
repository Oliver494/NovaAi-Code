//! Fetch bounded public page content. Never forwards credentials or follows a
//! redirect to a local service. DNS answers are pinned to the validated address.
use futures_util::StreamExt;
use std::{net::IpAddr, time::Duration};
use url::Url;

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && !ip.is_documentation()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && ip.octets()[0] != 0
                && ip.octets()[0] < 224
                && !(ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
        }
        IpAddr::V6(ip) => ip
            .to_ipv4_mapped()
            .map(|ip| public_ip(IpAddr::V4(ip)))
            .unwrap_or_else(|| {
                (ip.segments()[0] & 0xe000) == 0x2000 && ip.segments()[0..2] != [0x2001, 0xdb8]
            }),
    }
}

pub fn page_text(html: &str) -> String {
    let mut cleaned = html.to_owned();
    for tag in ["script", "style", "noscript", "svg"] {
        loop {
            let lower = cleaned.to_ascii_lowercase();
            let Some(start) = lower.find(&format!("<{tag}")) else {
                break;
            };
            let Some(end) = lower[start..].find(&format!("</{tag}>")) else {
                cleaned.truncate(start);
                break;
            };
            cleaned.replace_range(start..start + end + tag.len() + 3, " ");
        }
    }
    let mut inside = false;
    let mut result = String::new();
    for ch in cleaned.chars() {
        match ch {
            '<' => inside = true,
            '>' => {
                inside = false;
                result.push(' ');
            }
            _ if !inside => result.push(ch),
            _ => {}
        }
    }
    result
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace("&amp;", "&")
        .replace("&nbsp;", " ")
        .replace("&quot;", "\"")
        .chars()
        .take(12000)
        .collect()
}

pub async fn read_public_page(value: &str) -> Result<String, String> {
    tokio::time::timeout(Duration::from_secs(15), fetch_page(value))
        .await
        .map_err(|_| "La página tardó demasiado en responder.".to_string())?
}

async fn fetch_page(value: &str) -> Result<String, String> {
    let mut url = Url::parse(value).map_err(|_| "El enlace no es válido.")?;
    for _ in 0..5 {
        if !matches!(url.scheme(), "https" | "http")
            || !url.username().is_empty()
            || url.password().is_some()
            || !matches!(url.port_or_known_default(), Some(80 | 443))
        {
            return Err("Solo se pueden consultar páginas web públicas HTTP o HTTPS.".into());
        }
        let host = url.host_str().ok_or("El enlace no tiene dominio.")?;
        let addresses: Vec<_> =
            tokio::net::lookup_host((host, url.port_or_known_default().unwrap()))
                .await
                .map_err(|_| "No se pudo resolver el dominio.")?
                .collect();
        if addresses.is_empty() || addresses.iter().any(|address| !public_ip(address.ip())) {
            return Err("El enlace no corresponde a una dirección pública.".into());
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host, &addresses)
            .timeout(Duration::from_secs(10))
            .user_agent("Vareliox (public page reader)")
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "No se pudo conectar con la página.")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or("Redirección no válida.")?;
            url = url.join(location).map_err(|_| "Redirección no válida.")?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("La página respondió HTTP {}.", response.status()));
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type.starts_with("text/") {
            return Err("El enlace no contiene una página de texto compatible.".into());
        }
        let html = content_type.contains("html");
        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| "La lectura de la página se interrumpió.")?;
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err("La página supera el tamaño permitido.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let text = String::from_utf8_lossy(&bytes);
        let text = if html {
            page_text(&text)
        } else {
            text.chars().take(12000).collect()
        };
        if text.trim().is_empty() {
            return Err("La página no contiene texto legible; puede requerir JavaScript.".into());
        }
        return Ok(text);
    }
    Err("La página tiene demasiadas redirecciones.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires public internet"]
    async fn live_public_page_reader() {
        let text = read_public_page("https://www.rust-lang.org/")
            .await
            .unwrap();
        assert!(text.to_lowercase().contains("rust"));
        assert!(text.len() > 100);
    }
    #[test]
    fn excludes_local_services_and_mapped_addresses() {
        for ip in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        assert!(public_ip("1.1.1.1".parse().unwrap()));
    }
    #[test]
    fn extracts_visible_text_without_scripts_or_styles() {
        assert_eq!(page_text("<style>hidden</style><h1>Hola</h1><script>execute()</script><p>Texto &amp; datos</p>"), "Hola Texto & datos");
    }
}
