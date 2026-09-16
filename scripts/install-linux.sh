#!/bin/bash
# Hashtag Notepad Linux Desktop Integration Script
# Integrates the AppImage into the user's local environment without root/sudo.

set -e

APP_NAME="Hashtag Notepad"
APP_EXEC="hashtag-notepad"
APP_DIR="$HOME/.local/share/hashtag-notepad"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DIR="$HOME/.local/share/applications"
BIN_DIR="$HOME/.local/bin"

# Find the AppImage in the current directory
APPIMAGE_FILE=$(ls -1 *.AppImage 2>/dev/null | grep -i hashtag | head -n 1)

if [ -z "$APPIMAGE_FILE" ]; then
    echo " Error: Could not find a Hashtag Notepad .AppImage in this directory."
    echo "   Please ensure this script is in the same folder as the downloaded AppImage."
    exit 1
fi

echo "📦 Integrating $APP_NAME into your desktop environment..."

# 1. Create necessary directories
mkdir -p "$APP_DIR"
mkdir -p "$ICON_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$BIN_DIR"

# 2. Copy the AppImage to a permanent location
echo "   → Copying AppImage to $APP_DIR..."
cp "$APPIMAGE_FILE" "$APP_DIR/$APP_EXEC.AppImage"
chmod +x "$APP_DIR/$APP_EXEC.AppImage"

# 3. Create a symlink in ~/.local/bin for terminal access
ln -sf "$APP_DIR/$APP_EXEC.AppImage" "$BIN_DIR/$APP_EXEC"

# 4. Install the icon (looks in the current directory or extracted app resources)
if [ -f "assets/icon.png" ]; then
    echo "   → Installing application icon..."
    cp "assets/icon.png" "$ICON_DIR/hashtag-notepad.png"
elif [ -f "squashfs-root/assets/icon.png" ]; then
    echo "   → Extracting icon from AppImage..."
    cp "squashfs-root/assets/icon.png" "$ICON_DIR/hashtag-notepad.png"
else
    echo "   ⚠️ Warning: 'icon.png' not found. The app will work, but the icon may be generic."
fi

# 5. Create the .desktop file
echo "   → Creating desktop entry..."
cat > "$DESKTOP_DIR/hashtag-notepad.desktop" << EOF
[Desktop Entry]
Name=$APP_NAME
Comment=A lightweight notepad with collapsible #hashtag sections
Exec=$APP_DIR/$APP_EXEC.AppImage %U
Icon=hashtag-notepad
Type=Application
Categories=Utility;TextEditor;
Keywords=notes;text;markdown;hashtags;
Terminal=false
StartupWMClass=hashtag-notepad
MimeType=text/plain;text/markdown;
EOF

# 6. Update desktop and icon caches
echo "   → Updating desktop and icon caches..."
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo ""
echo "✅ Installation complete!"
echo "🚀 You can now find '$APP_NAME' in your application menu."
echo "💡 To run it from the terminal, simply type: $APP_EXEC"
echo ""
echo "🗑️ To uninstall, run:"
echo "   rm -f \"$APP_DIR/$APP_EXEC.AppImage\""
echo "   rm -f \"$BIN_DIR/$APP_EXEC\""
echo "   rm -f \"$ICON_DIR/hashtag-notepad.png\""
echo "   rm -f \"$DESKTOP_DIR/hashtag-notepad.desktop\""
echo "   update-desktop-database \"$DESKTOP_DIR\""