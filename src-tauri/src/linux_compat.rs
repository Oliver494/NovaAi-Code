const VIRTUAL_MACHINE_MARKERS: &[&str] = &[
    "bhyve",
    "bochs",
    "hyper-v",
    "innotek",
    "kvm",
    "microsoft corporation",
    "parallels",
    "qemu",
    "virtual machine",
    "virtualbox",
    "vmware",
    "xen",
];

fn text_identifies_virtual_machine(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    VIRTUAL_MACHINE_MARKERS
        .iter()
        .any(|marker| normalized.contains(marker))
}

#[cfg(target_os = "linux")]
fn is_virtual_machine() -> bool {
    const IDENTITY_FILES: &[&str] = &[
        "/sys/class/dmi/id/product_name",
        "/sys/class/dmi/id/sys_vendor",
        "/sys/class/dmi/id/board_vendor",
        "/sys/class/dmi/id/bios_vendor",
        "/proc/cpuinfo",
    ];

    if IDENTITY_FILES.iter().any(|path| {
        std::fs::read_to_string(path)
            .map(|value| text_identifies_virtual_machine(&value))
            .unwrap_or(false)
    }) {
        return true;
    }

    std::process::Command::new("systemd-detect-virt")
        .arg("--quiet")
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn set_if_missing(name: &str, value: &str) {
    if std::env::var_os(name).is_none() {
        std::env::set_var(name, value);
    }
}

/// WebKitGTK can fail before the first window is shown when a virtual GPU
/// advertises 3D acceleration but cannot provide a compatible DMA-BUF surface.
/// Configure its renderer before Tauri initializes GTK/WebKit.
pub(crate) fn configure_webview_runtime() {
    #[cfg(target_os = "linux")]
    {
        let requested_mode = std::env::var("NOVAAI_WEBVIEW_RENDERER")
            .unwrap_or_else(|_| "auto".into())
            .to_ascii_lowercase();
        let use_software_renderer = match requested_mode.as_str() {
            "hardware" => false,
            "software" => true,
            _ => is_virtual_machine(),
        };

        if use_software_renderer {
            set_if_missing("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            set_if_missing("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            eprintln!(
                "Vareliox Code: compatible WebKitGTK rendering enabled for this virtual machine."
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_common_virtual_machine_identifiers() {
        for identity in [
            "Oracle Corporation VirtualBox",
            "VMware, Inc.",
            "QEMU Standard PC (i440FX + PIIX, 1996)",
            "KVM",
            "Microsoft Corporation Virtual Machine",
        ] {
            assert!(text_identifies_virtual_machine(identity), "{identity}");
        }
    }

    #[test]
    fn does_not_classify_common_physical_hardware_as_virtual() {
        for identity in [
            "Dell Inc. XPS 15",
            "ASUSTeK COMPUTER INC.",
            "Framework Laptop",
        ] {
            assert!(!text_identifies_virtual_machine(identity), "{identity}");
        }
    }
}
