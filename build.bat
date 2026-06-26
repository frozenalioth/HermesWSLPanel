@echo off
chcp 65001 >nul
title Hermes WSL Panel - Build

echo ========================================
echo   Hermes WSL Panel - 构建工具
echo ========================================
echo.

:: 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
echo 项目目录: %CD%
echo.

:: 检查 Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)
echo [OK] Python:
python --version
echo.

:: 安装依赖
echo [1/4] 安装依赖包...
pip install flask pywebview pyinstaller --quiet
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo [OK] 依赖安装完成
echo.

:: 清理旧的构建文件
echo [2/4] 清理旧构建...
if exist "dist\Hermes WSL Panel.exe" del "dist\Hermes WSL Panel.exe" /q
if exist "build" rmdir /s /q "build" >nul 2>&1
if exist "__pycache__" rmdir /s /q "__pycache__" >nul 2>&1
if exist "*.spec" del *.spec /q >nul 2>&1
echo [OK] 清理完成
echo.

:: 编译 .exe
echo [3/4] 正在编译 Hermes WSL Panel.exe...
echo   (可能需要 1-3 分钟，请耐心等待)
echo.

pyinstaller --onefile --windowed ^
    --icon=hermes_icon.ico ^
    --name "Hermes WSL Panel" ^
    --add-data "frontend;frontend" ^
    --add-data "photos;photos" ^
    --hidden-import=flask ^
    --hidden-import=webview ^
    main.py

if %ERRORLEVEL% NEQ 0 (
    echo [错误] 编译失败
    pause
    exit /b 1
)
echo [OK] 编译成功
echo.

:: 复制图标到输出目录
copy /Y hermes_icon.ico "dist\hermes_icon.ico" >nul 2>&1

:: 创建桌面快捷方式（可选）
echo [4/4] 创建桌面快捷方式...
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\Hermes WSL Panel.lnk"
set "EXE_PATH=%CD%\dist\Hermes WSL Panel.exe"

if exist "%EXE_PATH%" (
    powershell -Command ^
    "$WS = New-Object -ComObject WScript.Shell; " ^
    "$SC = $WS.CreateShortcut('%SHORTCUT_PATH%'); " ^
    "$SC.TargetPath = '%EXE_PATH%'; " ^
    "$SC.WorkingDirectory = '%CD%\dist'; " ^
    "$SC.IconLocation = '%CD%\hermes_icon.ico,0'; " ^
    "$SC.Description = 'Hermes WSL Panel - Hermes CLI 桌面启动器'; " ^
    "$SC.Save()"
    echo [OK] 桌面快捷方式已创建
) else (
    echo [警告] 快捷方式创建失败，可手动创建
)
echo.

echo ========================================
echo   构建完成！
echo.
echo   输出文件: dist\Hermes WSL Panel.exe
echo   桌面快捷方式: Hermes WSL Panel
echo ========================================
echo.
pause
