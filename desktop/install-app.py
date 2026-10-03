"""Build my local writer app and put a shortcut on my Desktop. Requires Xcode command-line tools."""
from pathlib import Path
import ipaddress
import os
import plistlib
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

repo = Path(__file__).resolve().parent.parent
installed_app = Path.home() / "Applications" / "OmniLede.app"
desktop_app = Path.home() / "Desktop" / "OmniLede.app"

def env_value(name: str) -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    env_file = repo / ".env.local"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf8").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() == name:
                return value.strip().strip('"').strip("'")
    return None

def validate_studio_url(value: str) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    unsafe_suffixes = (".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".home.arpa", ".onion")
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise SystemExit("OmniLede Studio URL must be a public HTTPS URL without credentials.")
    if "." not in host or host.endswith(".") or host == "localhost" or host.endswith(unsafe_suffixes):
        raise SystemExit("OmniLede Studio URL cannot use a local or reserved host.")
    try:
        if not ipaddress.ip_address(host).is_global:
            raise SystemExit("OmniLede Studio URL cannot use a private or reserved address.")
    except ValueError:
        pass
    return value

studio_url = validate_studio_url(env_value("OMNILEDE_STUDIO_URL") or env_value("NEXT_PUBLIC_STUDIO_URL") or "https://omnilede-news.netlify.app")
for required in (
    repo / "Start OmniLede.command",
    repo / "package.json",
    repo / "desktop/DailyPlanModels.swift",
    repo / "desktop/StudioConfiguration.swift",
    repo / "desktop/StudioBridge.swift",
    repo / "desktop/StudioWindowController.swift",
    repo / "desktop/OmniLede.swift",
):
    if not required.is_file():
        raise SystemExit(f"OmniLede project is incomplete: missing {required}")
# Build and sign away from Desktop's file-provider metadata before replacing the launcher.
with tempfile.TemporaryDirectory(prefix="omnilede-app-") as temp:
    bundle = Path(temp) / "OmniLede.app"
    macos = bundle / "Contents" / "MacOS"
    resources = bundle / "Contents" / "Resources"
    macos.mkdir(parents=True)
    resources.mkdir(parents=True)
    subprocess.run(
        [
            "/usr/bin/swiftc",
            str(repo / "desktop/DailyPlanModels.swift"),
            str(repo / "desktop/StudioConfiguration.swift"),
            str(repo / "desktop/StudioBridge.swift"),
            str(repo / "desktop/StudioWindowController.swift"),
            str(repo / "desktop/OmniLede.swift"),
            "-o",
            str(macos / "OmniLede"),
            "-framework",
            "AppKit",
            "-framework",
            "WebKit",
        ],
        check=True,
    )
    iconset = Path(temp) / "OmniLede.iconset"
    iconset.mkdir()
    shutil.copyfile(repo / "public/icons/icon-512.png", iconset / "icon_512x512.png")
    subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(resources / "OmniLede.icns")], check=True)
    info = dict(CFBundleIdentifier="com.rickysharan.omnilede.localwriter", CFBundleName="OmniLede",
                CFBundleDisplayName="OmniLede", CFBundleExecutable="OmniLede", CFBundlePackageType="APPL",
                CFBundleIconFile="OmniLede", CFBundleShortVersionString="5.0", CFBundleVersion="5",
                LSMinimumSystemVersion="12.0",
                NSHighResolutionCapable=True, OmniLedeProjectPath=str(repo), OmniLedeStudioURL=studio_url)
    with (bundle / "Contents/Info.plist").open("wb") as file:
        plistlib.dump(info, file)
    subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(bundle)], check=True)
    archive = Path.home() / "Library/Application Support/OmniLede"
    archive.mkdir(parents=True, exist_ok=True)

    def archive_existing(candidate: Path) -> None:
        if candidate.is_symlink():
            candidate.unlink()
        elif candidate.exists():
            backup = Path(tempfile.mkdtemp(prefix="previous-app-", dir=archive)) / "OmniLede.app"
            shutil.move(str(candidate), str(backup))

    archive_existing(desktop_app)
    archive_existing(installed_app)
    installed_app.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(bundle, installed_app, copy_function=shutil.copyfile)
    (installed_app / "Contents/MacOS/OmniLede").chmod(0o755)
    # Keep the signed bundle outside Desktop's file provider, which can add FinderInfo later.
    subprocess.run(["/usr/bin/xattr", "-cr", str(installed_app)], check=True)
    subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(installed_app)], check=True)
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose", str(installed_app)], check=True)
    desktop_app.symlink_to(installed_app)
    print(f"Installed {installed_app}")
    print(f"Desktop shortcut {desktop_app}")
