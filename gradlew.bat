@ECHO OFF
SET DIR=%~dp0
IF EXIST "%DIR%gradle\wrapper\gradle-wrapper.jar" (
  java -classpath "%DIR%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
  EXIT /B %ERRORLEVEL%
)
WHERE gradle >NUL 2>NUL
IF %ERRORLEVEL% EQU 0 (
  gradle %*
  EXIT /B %ERRORLEVEL%
)
ECHO Gradle is not available. Install Gradle once, then run: gradle wrapper --gradle-version 8.11.1
EXIT /B 1
