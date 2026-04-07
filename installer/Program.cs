using System.Diagnostics;

namespace HomeServer.Installer;

// ── Entry point ───────────────────────────────────────────────────────────────

static class Program
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerForm());
    }
}

// ── Colour palette (matches the dashboard's dark theme) ───────────────────────

static class Pal
{
    public static readonly Color Bg      = Color.FromArgb(11,  13,  18);
    public static readonly Color Surface = Color.FromArgb(17,  19,  24);
    public static readonly Color Surf2   = Color.FromArgb(23,  26,  34);
    public static readonly Color Border  = Color.FromArgb(37,  40,  54);
    public static readonly Color Text    = Color.FromArgb(221, 225, 237);
    public static readonly Color Muted   = Color.FromArgb(94,  98,  120);
    public static readonly Color Accent  = Color.FromArgb(74,  143, 245);
}

// ── Installer form ────────────────────────────────────────────────────────────

public sealed class InstallerForm : Form
{
    // ── State ─────────────────────────────────────────────────────────────────

    bool   _installed;
    string _action       = "install";   // install | update | uninstall
    string _installerDir = "";
    string _projectRoot  = "";

    // ── Step panels (all same bounds, one visible at a time) ──────────────────

    readonly Panel _pSetup    = StepPanel();
    readonly Panel _pModify   = StepPanel();
    readonly Panel _pProgress = StepPanel();

    // ── Cross-step references ─────────────────────────────────────────────────

    TextBox     _txtStorage  = null!;
    RadioButton _rdoUpdate   = null!;
    RichTextBox _rtbLog      = null!;
    ProgressBar _pbar        = null!;
    Button      _btnClose    = null!;
    Label       _lblHeading  = null!;

    // ── Constructor ───────────────────────────────────────────────────────────

    public InstallerForm()
    {
        SuspendLayout();

        Text            = "Home Server Setup";
        ClientSize      = new Size(540, 440);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox     = false;
        BackColor       = Pal.Bg;
        ForeColor       = Pal.Text;
        Font            = new Font("Segoe UI", 9.5f);
        StartPosition   = FormStartPosition.CenterScreen;

        BuildHeader();
        BuildSetupPanel();
        BuildModifyPanel();
        BuildProgressPanel();

        // All step panels share the same position below the header
        foreach (var p in new[] { _pSetup, _pModify, _pProgress })
        {
            p.Location = new Point(0, 64);
            p.Size     = new Size(ClientSize.Width, ClientSize.Height - 64);
            Controls.Add(p);
        }

        ResumeLayout(false);
        Load += (_, _) => Detect();
    }

    // ── Header ────────────────────────────────────────────────────────────────

    void BuildHeader()
    {
        var hdr = new Panel { Dock = DockStyle.Top, Height = 64, BackColor = Pal.Surface };
        hdr.Paint += (s, e) =>
        {
            using var pen = new Pen(Pal.Border);
            e.Graphics.DrawLine(pen, 0, hdr.Height - 1, hdr.Width, hdr.Height - 1);
        };

        _lblHeading = new Label
        {
            Text      = "Home Server Setup",
            Font      = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = Pal.Text,
            AutoSize  = true,
            Location  = new Point(20, 10),
        };

        var sub = new Label
        {
            Text      = "v0.1.2-beta  •  Windows Installer",
            Font      = new Font("Segoe UI", 8.5f),
            ForeColor = Pal.Muted,
            AutoSize  = true,
            Location  = new Point(20, 38),
        };

        hdr.Controls.AddRange(new Control[] { _lblHeading, sub });
        Controls.Add(hdr);
    }

    // ── Step 1a: fresh install ────────────────────────────────────────────────

    void BuildSetupPanel()
    {
        const int pad = 24;
        int y = pad;

        Lbl(_pSetup, "Welcome to Home Server Setup",
            pad, ref y, gap: 6, font: Bold(11));
        Lbl(_pSetup,
            "Choose where your files will be stored, then click Install.\n" +
            "After installation you can create your admin account at http://localhost:3000/setup.",
            pad, ref y, gap: 20, color: Pal.Muted);

        Lbl(_pSetup, "Storage directory", pad, ref y, gap: 6, font: Bold(9));

        _txtStorage = new TextBox
        {
            Location    = new Point(pad, y),
            Width       = 390,
            BackColor   = Pal.Surf2,
            ForeColor   = Pal.Text,
            BorderStyle = BorderStyle.FixedSingle,
            Text        = @"D:\server-storage",
            Font        = new Font("Consolas", 9.5f),
        };
        _pSetup.Controls.Add(_txtStorage);

        var browse = MkBtn("…", pad + 396, y - 1, 54);
        browse.Click += (_, _) =>
        {
            using var dlg = new FolderBrowserDialog { Description = "Select a storage folder" };
            if (dlg.ShowDialog() == DialogResult.OK)
                _txtStorage.Text = dlg.SelectedPath;
        };
        _pSetup.Controls.Add(browse);

        // Bottom row
        var cancel  = MkBtn("Cancel",  pad,                   330, 88);
        var install = MkBtn("Install", ClientSize.Width - 112, 330, 88, accent: true);
        cancel.Click  += (_, _) => Close();
        install.Click += (_, _) => { _action = "install"; ShowProgress(); };
        _pSetup.Controls.AddRange(new Control[] { cancel, install });
    }

    // ── Step 1b: already installed ────────────────────────────────────────────

    void BuildModifyPanel()
    {
        const int pad = 24;
        int y = pad;

        Lbl(_pModify, "Home Server is already installed.",
            pad, ref y, gap: 6, font: Bold(11));
        Lbl(_pModify, "Select an action, then click Next.",
            pad, ref y, gap: 14, color: Pal.Muted);

        HRule(_pModify, pad, ref y, gap: 14);

        // Update option
        _rdoUpdate = MkRadio(_pModify, "Update", pad, ref y, gap: 4);
        Lbl(_pModify,
            "Reinstall dependencies, rebuild from source, and restart the server.\n" +
            "Your .env and stored files are untouched.",
            pad + 20, ref y, gap: 16, color: Pal.Muted, small: true);

        // Uninstall option
        var rdoUninstall = MkRadio(_pModify, "Uninstall", pad, ref y, gap: 4);
        Lbl(_pModify,
            "Stop the server and remove the startup task.\n" +
            "Files and .env are left on disk. Remove the dashboard via Settings > Apps.",
            pad + 20, ref y, gap: 16, color: Pal.Muted, small: true);

        Lbl(_pModify, "To make no changes, click Cancel or close this window.",
            pad, ref y, gap: 0, color: Pal.Muted, small: true);

        _rdoUpdate.Checked = true;

        var cancel = MkBtn("Cancel", pad,                    330, 88);
        var next   = MkBtn("Next",   ClientSize.Width - 112, 330, 88, accent: true);
        cancel.Click += (_, _) => Close();
        next.Click   += (_, _) =>
        {
            _action = _rdoUpdate.Checked ? "update" : "uninstall";
            ShowProgress();
        };
        _pModify.Controls.AddRange(new Control[] { cancel, next });
        _ = rdoUninstall; // suppress unused warning
    }

    // ── Step 2: progress ──────────────────────────────────────────────────────

    void BuildProgressPanel()
    {
        const int pad = 24;

        _rtbLog = new RichTextBox
        {
            Location    = new Point(pad, 16),
            Size        = new Size(ClientSize.Width - pad * 2, 264),
            BackColor   = Pal.Surface,
            ForeColor   = Pal.Text,
            BorderStyle = BorderStyle.None,
            ReadOnly    = true,
            Font        = new Font("Consolas", 8.5f),
            ScrollBars  = RichTextBoxScrollBars.Vertical,
        };
        _pProgress.Controls.Add(_rtbLog);

        _pbar = new ProgressBar
        {
            Location = new Point(pad, 290),
            Size     = new Size(ClientSize.Width - pad * 2, 12),
            Style    = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 25,
        };
        _pProgress.Controls.Add(_pbar);

        _btnClose = MkBtn("Close", ClientSize.Width - 112, 330, 88);
        _btnClose.Enabled = false;
        _btnClose.Click  += (_, _) => Close();
        _pProgress.Controls.Add(_btnClose);
    }

    // ── Detection ─────────────────────────────────────────────────────────────

    void Detect()
    {
        // Walk up from the exe until we find the directory that holds install.ps1.
        // This works whether the exe is in installer/ directly or in a publish
        // subdirectory like bin/Release/.../win-x64/.
        var exeDir = Path.GetDirectoryName(Application.ExecutablePath) ?? "";
        _installerDir = FindInstallerDir(exeDir)
            ?? throw new DirectoryNotFoundException(
                $"Cannot find install.ps1 starting from: {exeDir}");
        _projectRoot = Path.GetFullPath(Path.Combine(_installerDir, ".."));

        using var p = new Process
        {
            StartInfo = new ProcessStartInfo("schtasks", "/Query /TN HomeServer")
            {
                UseShellExecute        = false,
                CreateNoWindow         = true,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
            }
        };
        try   { p.Start(); p.WaitForExit(5_000); _installed = p.ExitCode == 0; }
        catch { _installed = false; }

        Show(_installed ? _pModify : _pSetup);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    void ShowProgress()
    {
        _lblHeading.Text = _action switch
        {
            "install"   => "Installing…",
            "update"    => "Updating…",
            "uninstall" => "Uninstalling…",
            _           => "Working…"
        };
        Show(_pProgress);
        Task.Run(RunScript);
    }

    void Show(Panel target)
    {
        foreach (var p in new[] { _pSetup, _pModify, _pProgress })
            p.Visible = (p == target);
    }

    // ── Script execution ──────────────────────────────────────────────────────

    void RunScript()
    {
        var script = Path.Combine(_installerDir, _action switch
        {
            "install"   => "install.ps1",
            "update"    => "update.ps1",
            "uninstall" => "uninstall.ps1",
            _           => throw new InvalidOperationException()
        });

        // Arguments forwarded to the script
        string extra = _action switch
        {
            "install"   => $"-StorageDir \"{_txtStorage.Text.Trim()}\" -SkipAdminPrompt",
            "uninstall" => "-Silent",
            _           => ""
        };

        Log($"Script : {script}\n");
        Log($"Action : {_action}\n\n");

        var psi = new ProcessStartInfo
        {
            FileName               = "powershell.exe",
            Arguments              = $"-ExecutionPolicy Bypass -NonInteractive -File \"{script}\" {extra}",
            UseShellExecute        = false,
            CreateNoWindow         = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            WorkingDirectory       = _projectRoot,
        };

        int exit;
        using (var p = new Process { StartInfo = psi })
        {
            p.OutputDataReceived += (_, e) => { if (e.Data is not null) Log(e.Data + "\n"); };
            p.ErrorDataReceived  += (_, e) => { if (e.Data is not null) Log("[ERR] " + e.Data + "\n"); };
            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            p.WaitForExit();
            exit = p.ExitCode;
        }

        Invoke(() => Finish(exit));
    }

    void Finish(int exit)
    {
        _pbar.Style = ProgressBarStyle.Blocks;
        _pbar.Value = _pbar.Maximum;

        if (exit == 0)
        {
            Log(_action switch
            {
                "install"   => "\n✓ Installation complete.\n  Visit http://localhost:3000/setup to create your admin account.\n",
                "update"    => "\n✓ Update complete.\n",
                "uninstall" => "\n✓ Uninstall complete.\n  Your files and .env were left on disk.\n",
                _           => "\n✓ Done.\n"
            });
            _lblHeading.Text = "Complete";
        }
        else
        {
            Log($"\n✗ Failed (exit {exit}). See output above for details.\n");
            _lblHeading.Text = "Errors occurred";
        }

        _btnClose.Enabled = true;
    }

    void Log(string text)
    {
        if (InvokeRequired) { Invoke(() => Log(text)); return; }
        _rtbLog.AppendText(text);
        _rtbLog.ScrollToCaret();
    }

    // ── Path resolution ───────────────────────────────────────────────────────

    static string? FindInstallerDir(string start)
    {
        var dir = new DirectoryInfo(start);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "install.ps1")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }

    // ── UI factory helpers ────────────────────────────────────────────────────

    static Panel StepPanel() => new()
    {
        Visible   = false,
        BackColor = Pal.Bg,
    };

    static Font Bold(float size) => new("Segoe UI", size, FontStyle.Bold);

    static void Lbl(Panel p, string text, int x, ref int y,
        int gap = 0, Color? color = null, Font? font = null, bool small = false)
    {
        var f   = font ?? (small ? new Font("Segoe UI", 8.5f) : new Font("Segoe UI", 9.5f));
        var lbl = new Label
        {
            Text      = text,
            Location  = new Point(x, y),
            Width     = p.Width > 0 ? p.Width - x - 24 : 480,
            AutoSize  = false,
            ForeColor = color ?? Pal.Text,
            Font      = f,
        };
        var sz  = TextRenderer.MeasureText(text, f, new Size(lbl.Width, 0),
                      TextFormatFlags.WordBreak);
        lbl.Height = sz.Height + 4;
        y += lbl.Height + gap;
        p.Controls.Add(lbl);
    }

    static void HRule(Panel p, int x, ref int y, int gap = 0)
    {
        var rule = new Panel
        {
            Location  = new Point(x, y),
            Size      = new Size(p.Width > 0 ? p.Width - x * 2 : 492, 1),
            BackColor = Pal.Border,
        };
        y += 1 + gap;
        p.Controls.Add(rule);
    }

    static RadioButton MkRadio(Panel p, string text, int x, ref int y, int gap = 0)
    {
        var r = new RadioButton
        {
            Text      = text,
            Location  = new Point(x, y),
            AutoSize  = true,
            ForeColor = Pal.Text,
            BackColor = Pal.Bg,
            Font      = new Font("Segoe UI", 9.5f, FontStyle.Bold),
        };
        y += r.PreferredSize.Height + gap;
        p.Controls.Add(r);
        return r;
    }

    Button MkBtn(string text, int x, int y, int width, bool accent = false)
    {
        var b = new Button
        {
            Text      = text,
            Location  = new Point(x, y),
            Size      = new Size(width, 30),
            BackColor = accent ? Pal.Accent : Pal.Surf2,
            ForeColor = accent ? Color.White : Pal.Text,
            FlatStyle = FlatStyle.Flat,
            Font      = accent
                ? new Font("Segoe UI", 9.5f, FontStyle.Bold)
                : new Font("Segoe UI", 9.5f),
            Cursor    = Cursors.Hand,
        };
        b.FlatAppearance.BorderColor = Pal.Border;
        return b;
    }
}
