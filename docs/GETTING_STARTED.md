# Getting started

1. Install Vareliox with the Windows `.exe`, the Linux `.deb`, or the AppImage.
2. Add a project folder. Vareliox restricts file operations to this folder and ignores generated or protected directories.
3. Open **Settings → Providers** and choose Ollama, LM Studio, or a cloud API.
4. Use **Test connection** before opening a chat.
5. Start with **Ask for approval** until you are comfortable with the proposed diffs and recovery workflow.

Vareliox stores conversations per project. Provider keys are stored through the operating-system credential store, not in project files or browser local storage. Linux uses the Secret Service keyring; minimal Kali installations may need `gnome-keyring`.

## Kali Linux

Install the Debian package with:

```bash
sudo apt install ./Vareliox*.deb
```

Alternatively, make the AppImage executable and launch it:

```bash
chmod +x ./Vareliox*.AppImage
./Vareliox*.AppImage
```

For local development, install the Tauri packages shown in the Linux section of the README. Vareliox uses `python3` and native Linux command names when the coding agent runs approved project checks.

## Local providers

- Ollama default endpoint: `http://127.0.0.1:11434`
- LM Studio default endpoint: `http://127.0.0.1:1234/v1`

Open **Settings → Hardware** for approximate quantized-model recommendations based on RAM and detected VRAM. Driver limitations can prevent exact VRAM detection.

## Safety and recovery

- Review the proposed before/after diff before applying changes.
- Vareliox creates a recovery snapshot before agent file operations.
- Restore a snapshot from **Settings → Recovery**.
- **Settings → Git** shows status and diff, can create a confirmed local commit, and can discard pending changes. Discard always creates a local recovery snapshot first and requires an existing base commit.
- Interrupted chats preserve the last question and offer a retry after restart.
