@echo off
setlocal
cd /d "%~dp0"

set "BRANCH=main"
set "REMOTE_URL=https://github.com/JupomIII/manuel-engrenages.git"
set "MESSAGE=Publie le manuel interactif (%date% %time%)"

where git >nul 2>&1
if errorlevel 1 (
  echo Git est introuvable. Installe Git for Windows puis relance ce script.
  exit /b 1
)

rem First run in this folder: connect it to the GitHub repository.
if not exist ".git" (
  echo Initialisation du depot local...
  git init -b %BRANCH%
  git remote add origin %REMOTE_URL%
  git fetch origin %BRANCH%
  if errorlevel 1 goto :fail
  git reset origin/%BRANCH%
  if errorlevel 1 goto :fail
)

rem Only the site files are published (no stray folders, no PDFs, no images).
git -c core.autocrlf=false add README.md index.html style.css app.js calculs.js tables.js tables_embedded.js math.js nomenclature.js ocr.js ocr_table.js publish.bat tables tools
if errorlevel 1 goto :fail
if errorlevel 1 goto :fail

git diff --cached --quiet
if errorlevel 1 (
  git -c core.autocrlf=false commit -m "%MESSAGE%"
  if errorlevel 1 goto :fail
) else (
  echo Aucune modification a enregistrer.
)

echo Envoi vers GitHub...
git push origin %BRANCH%
if errorlevel 1 goto :fail

echo.
echo Site publie : https://jupomiii.github.io/manuel-engrenages/
echo (La mise a jour peut prendre une minute.)
exit /b 0

:fail
echo.
echo La publication a echoue. Lis le message ci-dessus.
exit /b 1
