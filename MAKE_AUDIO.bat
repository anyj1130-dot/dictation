@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo ===== 받아쓰기 음성 만들기 =====
set PY=
where py >nul 2>nul && set PY=py
if not defined PY ( where python >nul 2>nul && set PY=python )
if not defined PY (
  echo.
  echo 파이썬이 설치되어 있지 않아요.
  echo 열리는 페이지에서 Python을 설치한 뒤 이 파일을 다시 실행해 주세요.
  echo 설치할 때 "Add python.exe to PATH" 칸에 꼭 체크하세요.
  start https://www.python.org/downloads/
  pause
  exit /b
)
echo 필요한 도구를 설치하는 중...
%PY% -m pip install --quiet --upgrade edge-tts truststore
echo 음성을 만드는 중... (10~20분 걸려요. 창을 닫지 마세요)
%PY% tools\make_audio.py %*
if errorlevel 1 (
  pause
  exit /b
)
echo.
echo audio 폴더를 열어요. 새로 생긴 .js 파일을 GitHub audio 폴더에 올려 주세요.
start "" "%~dp0audio"
pause
