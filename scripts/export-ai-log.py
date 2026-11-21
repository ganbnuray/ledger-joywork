import json, re, sys

src, out = sys.argv[1], sys.argv[2]
MAX_RESULT = 4000
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@gmail(\.com)?")
REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)

def clean(text):
    text = REMINDER.sub("", text)
    text = EMAIL.sub("[email removed]", text)
    text = re.sub(r"sk-ant-[A-Za-z0-9_-]+", "[key removed]", text)
    return text.strip()

def result_text(content):
    if isinstance(content, str):
        return content
    parts = []
    for c in content:
        if c.get("type") == "text":
            parts.append(c["text"])
        else:
            parts.append(f"[{c.get('type')} content]")
    return "\n".join(parts)

lines = ["# Claude Code session: design and rule based matcher", "",
         "Exported from the Claude Code session transcript. User messages, assistant replies and tool calls are complete.",
         f"Tool results longer than {MAX_RESULT} characters are cut, and system reminders and my email address are removed.", ""]

for raw in open(src):
    d = json.loads(raw)
    if d.get("type") not in ("user", "assistant") or d.get("isMeta"):
        continue
    content = d["message"]["content"]
    if isinstance(content, str):
        content = [{"type": "text", "text": content}]
    for block in content:
        kind = block.get("type")
        if d["type"] == "user" and kind == "text":
            text = clean(block["text"])
            if text:
                lines += ["---", "", "## User", "", text, ""]
        elif d["type"] == "assistant" and kind == "text":
            text = clean(block["text"])
            if text:
                lines += ["### Claude", "", text, ""]
        elif kind == "tool_use":
            args = clean(json.dumps(block.get("input", {}), indent=2, ensure_ascii=False))
            lines += [f"**Tool call: {block['name']}**", "", "```json", args, "```", ""]
        elif kind == "tool_result":
            text = clean(result_text(block.get("content", "")))
            if len(text) > MAX_RESULT:
                text = text[:MAX_RESULT] + f"\n... [cut, {len(text) - MAX_RESULT} more characters]"
            lines += ["<details><summary>Tool result</summary>", "", "```", text.replace("```", "'''"), "```", "", "</details>", ""]

open(out, "w").write("\n".join(lines) + "\n")
