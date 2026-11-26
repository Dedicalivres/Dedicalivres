"""Synthetic browser tests. No real microphone, service credentials or external requests."""
import argparse
import functools
import io
import threading
import tempfile
import shutil
import wave
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
def wav(seconds):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(8000)
        out.writeframes(b"\0\0" * int(8000 * seconds))
    return buf.getvalue()

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def run(engine, name, origin):
    args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] if name == "chromium" else []
    browser = engine.launch(args=args)
    try:
        ctx = browser.new_context(viewport={"width":390, "height":844})
        if name == "chromium":
            ctx.grant_permissions(["microphone"], origin=origin)
        page = ctx.new_page()
        errors, external = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        def guard(route):
            if route.request.url.startswith(origin + "/"):
                route.continue_()
            elif route.request.url.startswith(("http:", "https:")):
                external.append(route.request.url)
                route.abort()
            else:
                route.continue_()
        page.route("**/*", guard)
        page.goto(origin + "/author-audio-local-preview.html")
        el = page.locator
        def put(data, filename="sample.wav"):
            el("#file").set_input_files({"name":filename,"mimeType":"audio/wav","buffer":data})
        expect(el("#listener")).to_be_hidden()
        expect(el("#admin")).to_be_hidden()
        put(wav(1))
        expect(el("#preview")).to_be_enabled(timeout=15000)
        el("#preview").click()
        expect(el("#listener")).to_be_hidden()
        el("#transcript").fill("Présentation fictive <script>")
        el("#preview").click()
        expect(el("#listener")).to_be_visible()
        expect(el("#transcript-out")).to_have_text("Présentation fictive <script>")
        assert not el("#player").evaluate("(a)=>a.autoplay")
        expect(el("#draft")).to_be_disabled()
        el("#player").evaluate("(a)=>a.play()")
        page.wait_for_function("document.querySelector('#player').currentTime > 0")
        el("#player").evaluate("(a)=>a.pause()")
        assert el("#player").evaluate("(a)=>a.paused")
        el("#consent").check()
        el("#draft").click()
        expect(el("#admin")).to_be_visible()
        el("#intent").click()
        expect(el("#admin-status")).to_contain_text("motif")
        el("#reason").fill("Intention fictive")
        el("#intent").click()
        expect(el("#admin-status")).to_contain_text("Aucune décision enregistrée")
        el("#transcript").fill("Texte modifié")
        expect(el("#consent")).not_to_be_checked()
        expect(el("#admin")).to_be_hidden()
        expect(el("#draft")).to_be_disabled()
        el("#remove").click()
        expect(el("#listener")).to_be_hidden()
        expect(el("#preview")).to_be_disabled()
        put(b"corrupt")
        expect(el("#status")).to_contain_text("ne peut pas lire",timeout=15000)
        put(wav(121))
        expect(el("#status")).to_contain_text("supérieure à deux minutes",timeout=15000)
        put(b"\0"*10000001)
        expect(el("#status")).to_contain_text("taille non conforme")
        for width in (320,390,768,1440):
            page.set_viewport_size({"width":width,"height":844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"overflow {width}"
        # Test permission refusal via a controlled stub, not a real microphone.
        page.evaluate("""()=>{window.originalGUM=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Test refusal','NotAllowedError'));}""")
        el("#record").click()
        expect(el("#status")).to_contain_text("Microphone refusé")
        page.evaluate("()=>{navigator.mediaDevices.getUserMedia=window.originalGUM;}")
        if name == "chromium":
            el("#record").click()
            expect(el("#stop")).to_be_enabled(timeout=10000)
            page.wait_for_timeout(1300)
            el("#stop").click()
            expect(el("#preview")).to_be_enabled(timeout=15000)
            el("#remove").click()
            el("#record").click()
            expect(el("#stop")).to_be_enabled(timeout=10000)
            el("#remove").click()
            expect(el("#stop")).to_be_disabled()
            expect(el("#preview")).to_be_disabled()
        assert not errors, errors
        assert not external, external
        print(f"PASS {name}: import, transcript, consent, playback, local moderation, removal, invalid file, limits, responsive, permission refusal; " + ("fake microphone and cancellation" if name=="chromium" else "real microphone not tested"))
    finally:
        browser.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", choices=["chromium","webkit","both"], default="both")
    options=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="dedicalivres-audio-") as tmp:
        shutil.copyfile(ROOT/"docs/author-audio-local-preview.html", Path(tmp)/"author-audio-local-preview.html")
        server=ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Quiet,directory=tmp))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                for name in (["chromium","webkit"] if options.browser=="both" else [options.browser]):
                    run(getattr(p,name),name,f"http://127.0.0.1:{server.server_port}")
        finally:
            server.shutdown()

if __name__ == "__main__":
    main()
