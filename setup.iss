; Hermes WSL Panel 安装脚本
; 使用方法：在 Inno Setup 中打开此文件，点"编译"

[Setup]
AppName=Hermes WSL Panel
AppVersion=1.0
AppPublisher=玉衡飞雪
AppPublisherURL=https://github.com/你的用户名/HermesWSLPanel
DefaultDirName={autopf}\Hermes WSL Panel
DefaultGroupName=Hermes WSL Panel
OutputDir=.
OutputBaseFilename=Hermes WSL Panel Setup
Compression=lzma
SolidCompression=yes
UninstallDisplayIcon={app}\Hermes WSL Panel.exe
SetupIconFile=hermes_icon.ico

[Files]
Source: "dist\Hermes WSL Panel.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Hermes WSL Panel"; Filename: "{app}\Hermes WSL Panel.exe"
Name: "{group}\卸载 Hermes WSL Panel"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Hermes WSL Panel"; Filename: "{app}\Hermes WSL Panel.exe"

[Run]
Filename: "{app}\Hermes WSL Panel.exe"; Description: "运行 Hermes WSL Panel"; Flags: nowait postinstall skipifsilent
