; ══════════════════════════════════════════════════════════════════════════════
; Home Server — Windows Setup
;
; Compile:
;   makensis installer\setup.nsi
;   (NSIS 3.x — https://nsis.sourceforge.io)
;
; Output:
;   installer\HomeServerSetup.exe
;
; Behaviour:
;   • Not installed → Install wizard
;   • Already installed → Choose: Update | Uninstall | Cancel (window X / Cancel btn)
; ══════════════════════════════════════════════════════════════════════════════

Unicode True

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; ── Metadata ──────────────────────────────────────────────────────────────────

!define APP_NAME   "Home Server"
!define TASK_NAME  "HomeServer"
!define APP_VER    "0.1.2-beta"

Name              "${APP_NAME} ${APP_VER}"
OutFile           "HomeServerSetup.exe"
InstallDir        "$EXEDIR\.."          ; exe is in installer/, project root is parent
RequestExecutionLevel admin             ; UAC elevation prompt
ShowInstDetails   show
SetCompressor     /SOLID lzma

; ── Global state ──────────────────────────────────────────────────────────────

Var AlreadyInstalled   ; "1" | "0"
Var SelectedAction     ; install | update | uninstall

; ── MUI theme ─────────────────────────────────────────────────────────────────

!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE       "${APP_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT        "This wizard will install ${APP_NAME} on your \
computer and configure it to start automatically at login.$\r$\n$\r$\n\
Click Next to continue."

!define MUI_FINISHPAGE_TITLE        "Setup Complete"
!define MUI_FINISHPAGE_TEXT         "${APP_NAME} is installed and running.$\r$\n$\r$\n\
Open the setup page to create your admin account, or launch the \
Home Server Dashboard from the Start Menu."
!define MUI_FINISHPAGE_LINK         "Open http://localhost:3000/setup"
!define MUI_FINISHPAGE_LINK_LOCATION "http://localhost:3000/setup"

; ── Page declarations ─────────────────────────────────────────────────────────

; Welcome — only when not yet installed
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipWelcomeIfInstalled
!insertmacro MUI_PAGE_WELCOME
!undef MUI_PAGE_CUSTOMFUNCTION_PRE

; Modify dialog — only when already installed
Page custom ModifyPage ModifyPageLeave

; Progress log
!define MUI_PAGE_CUSTOMFUNCTION_PRE  SkipInstFilesIfUninstall
!insertmacro MUI_PAGE_INSTFILES
!undef MUI_PAGE_CUSTOMFUNCTION_PRE

; Finish — only when not uninstalling
!define MUI_PAGE_CUSTOMFUNCTION_PRE  SkipFinishIfUninstall
!insertmacro MUI_PAGE_FINISH
!undef MUI_PAGE_CUSTOMFUNCTION_PRE

!insertmacro MUI_LANGUAGE "English"

; ── Detect existing installation ───────────────────────────────────────────────

Function .onInit
    StrCpy $AlreadyInstalled "0"
    StrCpy $SelectedAction   "install"

    ; schtasks exits 0 if the task exists
    nsExec::ExecToStack 'cmd.exe /c schtasks /Query /TN "${TASK_NAME}" >NUL 2>&1'
    Pop $0   ; exit code
    Pop $1   ; output (discarded)

    ${If} $0 == 0
        StrCpy $AlreadyInstalled "1"
        StrCpy $SelectedAction   "update"   ; default pre-selection
    ${EndIf}
FunctionEnd

; ── Page pre-functions ─────────────────────────────────────────────────────────

Function SkipWelcomeIfInstalled
    ${If} $AlreadyInstalled == "1"
        Abort
    ${EndIf}
FunctionEnd

Function SkipInstFilesIfUninstall
    ; Nothing to skip — uninstall still needs the progress window.
    ; (Kept as hook point for future use.)
FunctionEnd

Function SkipFinishIfUninstall
    ${If} $SelectedAction == "uninstall"
        Abort   ; close installer instead of showing finish page
    ${EndIf}
FunctionEnd

; ── Modify page (already-installed dialog) ─────────────────────────────────────

Var hModifyDlg
Var hRadioUpdate
Var hRadioUninstall

Function ModifyPage
    ${If} $AlreadyInstalled == "0"
        Abort   ; skip when doing a fresh install
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT \
        "${APP_NAME} is already installed" \
        "Select what you would like to do, then click Next."

    nsDialogs::Create 1018
    Pop $hModifyDlg
    ${If} $hModifyDlg == error
        Abort
    ${EndIf}

    ; Description label
    ${NSD_CreateLabel} 0 8u 100% 16u \
        "${APP_NAME} ${APP_VER} is currently installed on this machine."
    Pop $0

    ; Divider
    ${NSD_CreateHLine} 0 32u 100% 1u ""
    Pop $0

    ; Update radio
    ${NSD_CreateRadioButton} 0 42u 100% 14u \
        "Update — reinstall dependencies, rebuild from source, and restart the server"
    Pop $hRadioUpdate

    ${NSD_CreateLabel} 12u 58u 100% 20u \
        "Your configuration (.env) and stored files are preserved."
    Pop $0

    ; Uninstall radio
    ${NSD_CreateRadioButton} 0 86u 100% 14u \
        "Uninstall — stop the server and remove the startup task"
    Pop $hRadioUninstall

    ${NSD_CreateLabel} 12u 102u 100% 20u \
        "Your files and .env are kept on disk. The dashboard can be \
removed via Settings > Apps."
    Pop $0

    ; Cancel note
    ${NSD_CreateLabel} 0 130u 100% 12u \
        "To make no changes, click Cancel or close this window."
    Pop $0

    ; Pre-select Update
    ${NSD_SetState} $hRadioUpdate   ${BST_CHECKED}
    ${NSD_SetState} $hRadioUninstall ${BST_UNCHECKED}

    nsDialogs::Show
FunctionEnd

Function ModifyPageLeave
    ${NSD_GetState} $hRadioUpdate $0
    ${If} $0 == ${BST_CHECKED}
        StrCpy $SelectedAction "update"
    ${Else}
        StrCpy $SelectedAction "uninstall"
    ${EndIf}
FunctionEnd

; ── Main section ───────────────────────────────────────────────────────────────

Section "" SEC_MAIN
    SetOutPath "$INSTDIR"

    ${If} $SelectedAction == "install"
        Call RunInstall
    ${ElseIf} $SelectedAction == "update"
        Call RunUpdate
    ${ElseIf} $SelectedAction == "uninstall"
        Call RunUninstall
    ${EndIf}
SectionEnd

; ── Install ────────────────────────────────────────────────────────────────────
; Uses ExecWait (not nsExec) so a real console window appears — install.ps1
; prompts for storage path and admin credentials interactively.

Function RunInstall
    DetailPrint "A console window will open for the interactive install."
    DetailPrint "Follow the prompts there, then return here when complete."
    DetailPrint ""

    ExecWait 'powershell.exe -ExecutionPolicy Bypass \
              -File "$EXEDIR\install.ps1"' $0

    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "Installation encountered errors.$\nCheck the console output for details."
    ${EndIf}
FunctionEnd

; ── Update ─────────────────────────────────────────────────────────────────────

Function RunUpdate
    DetailPrint "Starting update — this may take a few minutes..."
    DetailPrint ""

    nsExec::ExecToLog \
        'powershell.exe -ExecutionPolicy Bypass -NonInteractive \
         -File "$EXEDIR\update.ps1"'
    Pop $0

    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "Update encountered errors.$\nSee the details above for more information."
    ${EndIf}
FunctionEnd

; ── Uninstall ──────────────────────────────────────────────────────────────────

Function RunUninstall
    DetailPrint "Uninstalling ${APP_NAME}..."
    DetailPrint ""

    nsExec::ExecToLog \
        'powershell.exe -ExecutionPolicy Bypass -NonInteractive \
         -File "$EXEDIR\uninstall.ps1" -Silent'
    Pop $0

    ${If} $0 == 0
        MessageBox MB_OK|MB_ICONINFORMATION \
            "${APP_NAME} has been uninstalled.$\r$\n$\r$\n\
To remove the dashboard: Settings > Apps > Home Server Dashboard.$\r$\n\
Your stored files and .env were left on disk."
    ${Else}
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "Uninstall encountered errors.$\nSee the details above for more information."
    ${EndIf}

    ; Close the installer — finish page is skipped via SkipFinishIfUninstall
    SetAutoClose true
FunctionEnd
