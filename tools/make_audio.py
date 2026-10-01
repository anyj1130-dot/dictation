# -*- coding: utf-8 -*-
"""
받아쓰기 음성 파일 만들기 — 'MAKE_AUDIO.bat'을 더블클릭하면 이 파일이 실행돼요.
결과: audio 폴더에 급수마다 파일 1개 (예: audio/3-1_1.js) → 새로 생긴 파일을 GitHub의 audio 폴더에 올리면 끝. (이미 있는 급수는 건너뛰어요)
발음이 이상한 문장은 아래 FIX에 '발음대로 적은 글자'를 넣고 다시 실행하면 그 급수만 새로 만들어요.
"""
import asyncio, base64, json, os, re, sys

# 학교 인터넷처럼 보안 장치가 있는 곳에서도 되도록, 윈도우에 설치된 인증서를 그대로 써요.
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

try:
    import edge_tts
except ImportError:
    print("edge-tts가 없어요. MAKE_AUDIO.bat으로 실행해 주세요.")
    sys.exit(1)

VOICE = "ko-KR-SunHiNeural"          # 남자 목소리: ko-KR-InJoonNeural
RATE_NORMAL, RATE_SLOW = "-5%", "-35%"

# 문장ID: 음성에 넣을 글자 (발음 교정용 — 화면 글자는 그대로, 소리만 바뀜)
FIX = {
    # "4-1_1_05": "켜 보니 이게 웬닐릴까요?",
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import glob
data = {"levels": []}
for fp in sorted(glob.glob(os.path.join(ROOT, "data", "g*.js"))):   # 학년별 데이터 (g3.js, g4.js …)
    src = open(fp, encoding="utf-8").read()
    data["levels"] += json.loads(re.search(r"\]\s*=\s*(\{.*\});\s*$", src, re.S).group(1))["levels"]
out_dir = os.path.join(ROOT, "audio")
os.makedirs(out_dir, exist_ok=True)
only = set(sys.argv[1:])   # 특정 급수만: py tools\make_audio.py 4-1_1

async def tts(text, rate):
    buf = bytearray()
    for attempt in range(3):
        try:
            async for chunk in edge_tts.Communicate(text, VOICE, rate=rate).stream():
                if chunk["type"] == "audio":
                    buf.extend(chunk["data"])
            return bytes(buf)
        except Exception as e:
            buf = bytearray()
            print("  다시 시도:", str(e)[:120])
            await asyncio.sleep(2)
    print("\n음성 서버에 연결하지 못했어요.")
    print("학교 인터넷의 보안 장치가 막는 것 같아요. 집 인터넷이나 휴대폰 핫스팟에 연결한 뒤 다시 실행해 주세요.")
    print("(이미 만든 급수는 건너뛰고 이어서 만들어요.)")
    sys.exit(1)

async def main():
    total = 0
    for L in data["levels"]:
        if only and L["key"] not in only:
            continue
        path = os.path.join(out_dir, L["key"] + ".js")
        fixed = any(s["id"] in FIX for s in L["sentences"])
        if os.path.exists(path) and not only and not fixed and "--all" not in sys.argv:
            print(f"[건너뜀] {L['key']} (이미 있음)")
            continue
        entries = {}
        for s in L["sentences"]:
            text = FIX.get(s["id"], s["text"])
            n = await tts(text, RATE_NORMAL)
            sl = await tts(text, RATE_SLOW)
            entries[s["id"]] = {"n": base64.b64encode(n).decode(), "s": base64.b64encode(sl).decode()}
            total += 1
            print(f"  {s['id']}  {s['text']}")
        with open(path, "w", encoding="utf-8") as f:
            f.write("Object.assign(window.AUDIO_DATA=window.AUDIO_DATA||{}," + json.dumps(entries) + ");\n")
        print(f"[완료] {L['key']}  ({len(L['sentences'])}문장)")
    print(f"\n끝! 새로 만든 문장 {total}개. audio 폴더 안의 .js 파일들을 GitHub의 audio 폴더에 올려 주세요.")

asyncio.run(main())
