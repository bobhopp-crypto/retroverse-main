#!/usr/bin/env python3
import tkinter as tk
from tkinter import scrolledtext, ttk
import subprocess
import threading
import sys
import os
from pathlib import Path

# --- CONFIG ---
BASE_DIR = Path("/Users/bobhopp/Sites/retroverse-data")
UPDATE_SCRIPT = BASE_DIR / "scripts" / "rv_update_data.py"
PYTHON = sys.executable
_SCRIPTS = BASE_DIR / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from utils.video_source import detect_video_source


class Tooltip:
    """Lightweight tooltip widget for tkinter widgets."""
    # Style: dark background, light text, distinct border
    BG = "#2B2B2B"
    FG = "#F2F2F2"
    BORDER = "#555555"
    PAD = 8
    OFFSET_X = 12
    OFFSET_Y = 12
    WRAP = 300

    def __init__(self, widget, text):
        self.widget = widget
        self.text = text
        self.tooltip_window = None
        self.widget.bind("<Enter>", self.on_enter)
        self.widget.bind("<Leave>", self.on_leave)

    def on_enter(self, event=None):
        # Position offset from cursor so tooltip does not overlap widget
        root_x = event.x_root + self.OFFSET_X if event else self.widget.winfo_rootx() + 25
        root_y = event.y_root + self.OFFSET_Y if event else self.widget.winfo_rooty() + 20

        self.tooltip_window = tk.Toplevel(self.widget)
        self.tooltip_window.wm_overrideredirect(True)

        frame = tk.Frame(self.tooltip_window, background=self.BORDER)
        frame.pack()
        label = tk.Label(
            frame,
            text=self.text,
            background=self.BG,
            foreground=self.FG,
            relief=tk.FLAT,
            borderwidth=0,
            font=("TkDefaultFont", 9),
            wraplength=self.WRAP,
            padx=self.PAD,
            pady=self.PAD,
            justify=tk.LEFT
        )
        label.pack(padx=1, pady=1)  # 1px gap so frame background shows as border
        self.tooltip_window.update_idletasks()
        w = self.tooltip_window.winfo_reqwidth()
        h = self.tooltip_window.winfo_reqheight()
        # Clamp to screen so tooltip stays visible
        root = self.widget.winfo_toplevel()
        rx, ry = root.winfo_rootx(), root.winfo_rooty()
        rw, rh = root.winfo_width(), root.winfo_height()
        x = max(rx, min(root_x, rx + rw - w))
        y = max(ry, min(root_y, ry + rh - h))
        self.tooltip_window.wm_geometry(f"+{x}+{y}")
        self.tooltip_window.lift()

    def on_leave(self, event=None):
        if self.tooltip_window:
            self.tooltip_window.destroy()
            self.tooltip_window = None


class RetroVerseUpdater(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("RetroVerse Data Updater")
        self.geometry("700x600")
        self.lift()
        self.process = None

        # --- OPTIONS ---
        self.full_update = tk.BooleanVar(value=False)
        self.export_vdj = tk.BooleanVar(value=True)
        self.merge_youtube = tk.BooleanVar(value=True)
        self.generate_thumbnails = tk.BooleanVar(value=True)
        self.build_video_index = tk.BooleanVar(value=False)
        self.build_registry = tk.BooleanVar(value=False)
        self.link_videos = tk.BooleanVar(value=False)
        self.deploy_site = tk.BooleanVar(value=False)
        self.write_report = tk.BooleanVar(value=False)
        self.analyze_r2 = tk.BooleanVar(value=False)
        self.publish_r2 = tk.BooleanVar(value=False)
        self.publish_thumbnails = tk.BooleanVar(value=False)
        self.execute_thumbnails = tk.BooleanVar(value=False)
        self.delete_detached_r2 = tk.BooleanVar(value=False)

        # Main options container
        options = tk.Frame(self, padx=10, pady=10)
        options.pack(fill=tk.BOTH, expand=True)

        # Full update checkbox (special, outside sections)
        full_update_frame = tk.Frame(options)
        full_update_frame.pack(fill=tk.X, pady=(0, 10))
        full_update_btn = tk.Checkbutton(
            full_update_frame,
            text="Full pipeline (data → site, excluding thumbnails & R2)",
            variable=self.full_update,
            command=self.on_full_update_toggle
        )
        full_update_btn.pack(anchor="w")
        Tooltip(full_update_btn, "Runs all data pipeline steps: export, merge, index, registry, link, deploy, report. Safe: read-only data operations.")
        self.option_buttons = [full_update_btn]

        # Section 1: DATA INGEST & ENRICHMENT
        section1 = ttk.LabelFrame(options, text="DATA INGEST & ENRICHMENT", padding=5)
        section1.pack(fill=tk.X, pady=5)
        self._add_checkbox(section1, "Export VirtualDJ library (videos only)", self.export_vdj,
                          "Extracts video metadata from VirtualDJ database.xml. Safe: read-only export, creates JSON/CSV files.")
        self._add_checkbox(section1, "Merge YouTube IDs into video data", self.merge_youtube,
                          "Adds YouTube video IDs to exported video data. Safe: appends data only, no overwrites.")

        # Section 2: MEDIA DERIVATIVES
        section2 = ttk.LabelFrame(options, text="MEDIA DERIVATIVES", padding=5)
        section2.pack(fill=tk.X, pady=5)
        self._add_checkbox(section2, "Generate thumbnails from video files", self.generate_thumbnails,
                          "Creates thumbnail images from video files using ffmpeg. Safe: writes to exports/thumbnails/ only.")
        self._add_checkbox(section2, "Publish selected thumbnails next to videos", self.publish_thumbnails,
                          "Copies thumbnails (MISSING_SIDECAR/DIFFERENT only) next to video files. Safe: dry-run by default, requires --execute-thumbnails to apply.")

        # Section 3: INDEX & REGISTRY
        section3 = ttk.LabelFrame(options, text="INDEX & REGISTRY", padding=5)
        section3.pack(fill=tk.X, pady=5)
        self._add_checkbox(section3, "Build searchable video index (JSON)", self.build_video_index,
                          "Creates video-index.json matching Billboard songs with video files. Safe: read-only matching, writes JSON.")
        self._add_checkbox(section3, "Build song registry from Billboard data", self.build_registry,
                          "Generates song-registry.json from Billboard Hot 100 database. Safe: read-only database query, writes JSON.")
        self._add_checkbox(section3, "Match videos to Billboard songs", self.link_videos,
                          "Links high-confidence video matches to song registry entries. Safe: updates JSON only, no file changes.")

        # Section 4: SITE & DISTRIBUTION
        section4 = ttk.LabelFrame(options, text="SITE & DISTRIBUTION", padding=5)
        section4.pack(fill=tk.X, pady=5)
        self._add_checkbox(section4, "Publish registry data to website", self.deploy_site,
                          "Copies song-registry.with-local-video.json to website data directory. Safe: single file copy operation.")

        # Video source for R2: use shared detection (NAS preferred, Dropbox fallback)
        d = detect_video_source(None)
        if d["source"] == "NAS":
            source_label = f"Video source: NAS ({d['path']})"
        elif d["source"] == "DROPBOX":
            source_label = "Video source: Dropbox (fallback)"
        elif d["source"] == "EXPLICIT":
            source_label = f"Video source: Explicit ({d['path']})"
        else:
            source_label = "Video source: Not available"
        source_tooltip = "NAS is preferred for R2 uploads. Dropbox is used only if NAS is not mounted."

        source_frame = tk.Frame(section4)
        source_frame.pack(fill=tk.X, pady=(0, 5))
        self.source_label_widget = tk.Label(source_frame, text=source_label, font=("TkDefaultFont", 9), fg="gray")
        self.source_label_widget.pack(side=tk.LEFT, anchor="w")
        Tooltip(self.source_label_widget, source_tooltip)

        # Optional: Mount NAS button (no credentials stored; macOS prompts)
        def do_mount_nas():
            if detect_video_source(None)["source"] == "NAS":
                self.log("NAS already mounted.")
                return
            mount_point = "/Volumes/RetroVerseNAS"
            smb_url = os.environ.get("MOUNT_NAS_SMB", "//nas-user@nas-host/RetroVerseNAS")

            def run_mount():
                try:
                    Path(mount_point).mkdir(parents=True, exist_ok=True)
                    r = subprocess.run(["mount_smbfs", smb_url, mount_point])
                    def log_result():
                        if r.returncode == 0:
                            self.log("NAS mount succeeded. Restart or re-open to refresh video source.")
                        else:
                            self.log("Mount NAS failed. Set MOUNT_NAS_SMB or run mount_smbfs from Terminal.")
                    self.after(0, log_result)
                except Exception as e:
                    self.after(0, lambda: self.log(f"Mount NAS failed: {e}"))

            self.log("Mounting NAS… (macOS may prompt for credentials)")
            threading.Thread(target=run_mount, daemon=True).start()

        mount_btn = tk.Button(source_frame, text="Mount NAS…", command=do_mount_nas, font=("TkDefaultFont", 9))
        mount_btn.pack(side=tk.RIGHT, padx=(8, 0))
        Tooltip(mount_btn, "Run mount_smbfs to mount RetroVerseNAS. Set MOUNT_NAS_SMB if needed. No credentials stored.")

        self._add_checkbox(section4, "Analyze R2 differences (read-only)", self.analyze_r2,
                          "Compares local VIDEO folder vs R2 bucket and writes CSV reports (r2_missing.csv, r2_orphaned.csv). Safe: read-only analysis, no changes.")
        self._add_checkbox(section4, "Upload videos to Cloudflare R2", self.publish_r2,
                          "Uploads VIDEO folder to R2 using rclone copy. Uses NAS if mounted, otherwise requires explicit VIDEO_SOURCE. Safe: append-only, uses --ignore-existing, no deletes.")
        self._add_checkbox(section4, "Delete detached videos from Cloudflare R2", self.delete_detached_r2,
                          "Deletes R2 video files that no longer exist locally. Preview-only by default; requires Apply changes.")

        # Section 5: REPORTING
        section5 = ttk.LabelFrame(options, text="REPORTING", padding=5)
        section5.pack(fill=tk.X, pady=5)
        self._add_checkbox(section5, "Write update summary report", self.write_report,
                          "Generates timestamped JSON report in exports/reports/. Safe: write-only, creates new files.")

        # Section 6: EXECUTION
        section6 = ttk.LabelFrame(options, text="EXECUTION", padding=5)
        section6.pack(fill=tk.X, pady=5)
        self._add_checkbox(section6, "Apply changes (otherwise preview only)", self.execute_thumbnails,
                          "When combined with publish-thumbnails or delete-detached-r2, performs actual operations. Without this, those steps run in dry-run mode.")

        # --- RUN BUTTON ---
        self.run_button = tk.Button(self, text="Run Update", command=self.run_update)
        self.run_button.pack(pady=10)

        # --- OUTPUT ---
        self.output = scrolledtext.ScrolledText(self, wrap=tk.WORD, height=20, state="disabled")
        self.output.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.log("RetroVerse Updater ready.")
        self.log(f"Using Python: {PYTHON}")
        self.log(f"Update script: {UPDATE_SCRIPT}")

        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def _add_checkbox(self, parent, label, variable, tooltip_text):
        """Helper to create checkbox with tooltip and add to option_buttons list."""
        btn = tk.Checkbutton(parent, text=label, variable=variable)
        btn.pack(anchor="w")
        Tooltip(btn, tooltip_text)
        self.option_buttons.append(btn)

    def log(self, text):
        self.output.configure(state="normal")
        self.output.insert(tk.END, text + "\n")
        self.output.see(tk.END)
        self.output.configure(state="disabled")
        self.update_idletasks()

    def run_update(self):
        self.run_button.config(state="disabled")
        for btn in self.option_buttons:
            btn.config(state="disabled")
        self.output.configure(state="normal")
        self.output.delete("1.0", tk.END)
        self.output.configure(state="disabled")

        threading.Thread(target=self._run_process).start()

    def on_full_update_toggle(self):
        if self.full_update.get():
            self.export_vdj.set(True)
            self.merge_youtube.set(True)
            self.generate_thumbnails.set(True)
            self.build_video_index.set(True)
            self.build_registry.set(True)
            self.link_videos.set(True)
            self.deploy_site.set(True)
            self.write_report.set(True)
            # Explicitly NOT setting: publish_r2, publish_thumbnails, delete_detached_r2, execute_thumbnails

    def _run_process(self):
        cmd = [PYTHON, "-u", str(UPDATE_SCRIPT)]

        if self.full_update.get():
            cmd.append("--full-update")
        if self.export_vdj.get():
            cmd.append("--export-vdj")
        if self.merge_youtube.get():
            cmd.append("--merge-youtube")
        if self.generate_thumbnails.get():
            cmd.append("--generate-thumbnails")
        if self.build_video_index.get():
            cmd.append("--build-video-index")
        if self.build_registry.get():
            cmd.append("--build-registry")
        if self.link_videos.get():
            cmd.append("--link-videos")
        if self.deploy_site.get():
            cmd.append("--deploy-site")
        if self.write_report.get():
            cmd.append("--write-report")
        if self.analyze_r2.get():
            cmd.append("--analyze-r2")
        if self.publish_r2.get():
            cmd.append("--publish-r2")
        if self.publish_thumbnails.get():
            cmd.append("--publish-thumbnails")
        if self.execute_thumbnails.get():
            cmd.append("--execute-thumbnails")
        if self.delete_detached_r2.get():
            cmd.append("--delete-detached-r2")

        if len(cmd) == 2:
            self.log("Nothing selected. Aborting.")
            self.run_button.config(state="normal")
            return

        self.log("GUI CMD: " + " ".join(cmd))
        self.log("")

        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )

            for line in self.process.stdout:
                self.log(line.rstrip())

            self.process.wait()
            if self.process.returncode == 0:
                self.log("\n✔ Update complete.")
            else:
                self.log("\n❌ Update failed.")

        except Exception as e:
            self.log(f"\n❌ ERROR: {e}")

        self.process = None
        self.run_button.config(state="normal")
        for btn in self.option_buttons:
            btn.config(state="normal")

    def on_close(self):
        if self.process and self.process.poll() is None:
            try:
                self.process.terminate()
            except Exception:
                pass
        self.destroy()


if __name__ == "__main__":
    RetroVerseUpdater().mainloop()
