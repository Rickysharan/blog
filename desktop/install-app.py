"""Build my local writer app and put it on my Desktop. Requires Xcode command-line tools."""
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parent.parent
app = Path.home() / "Desktop" / "OmniLede.app"
# Build and sign away from Desktop's file-provider metadata before replacing the launcher.
with tempfile.TemporaryDirectory(prefix="omnilede-app-") as temp:
    bundle = Path(temp) / "OmniLede.app"
    macos = bundle / "Contents" / "MacOS"
    resources = bundle / "Contents" / "Resources"
    macos.mkdir(parents=True)
    resources.mkdir(parents=True)
    subprocess.run(["/usr/bin/swiftc", str(repo / "desktop/OmniLede.swift"), "-o", str(macos / "OmniLede"), "-framework", "AppKit"], check=True)
    iconset = Path(temp) / "OmniLede.iconset"
    iconset.mkdir()
    shutil.copyfile(repo / "public/icons/icon-512.png", iconset / "icon_512x512.png")
    subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(resources / "OmniLede.icns")], check=True)
    info = dict(CFBundleIdentifier="com.rickysharan.omnilede.localwriter", CFBundleName="OmniLede",
                CFBundleDisplayName="OmniLede", CFBundleExecutable="OmniLede", CFBundlePackageType="APPL",
                CFBundleIconFile="OmniLede", CFBundleShortVersionString="2.0", LSMinimumSystemVersion="12.0",
                NSHighResolutionCapable=True, OmniLedeProjectPath=str(repo))
    with (bundle / "Contents/Info.plist").open("wb") as file:
        plistlib.dump(info, file)
    subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(bundle)], check=True)
    if app.exists():
        archive = Path.home() / "Library/Application Support/OmniLede"
        archive.mkdir(parents=True, exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix="previous-app-", dir=archive)) / "OmniLede.app"
        shutil.move(str(app), str(backup))
    shutil.copytree(bundle, app, copy_function=shutil.copyfile)
    (app / "Contents/MacOS/OmniLede").chmod(0o755)
    subprocess.run(["/usr/bin/codesign", "--verify", "--verbose", str(app)], check=True)
    print(f"Installed {app}")
