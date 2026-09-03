#!/usr/bin/env python3
"""Spike de dead keys en Linux: WebKitGTK contra GtkTextView nativo.

Equivalente del Driver.swift de macOS. Misma pregunta: el webview que usaria
Tauri, ¿se comporta como un campo de texto nativo con layout espanol?

Se ejecuta bajo Xvfb con setxkbmap es. Las teclas se inyectan por XTEST
(xdotool), que a nivel de cliente X es indistinguible del hardware real, asi
que el compose de GTK (gtk-im-context-simple) se ejercita de verdad.
"""
import json, os, subprocess, sys
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib, Gdk

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(os.path.dirname(HERE), 'auto.html')

# (id, descripcion, [nombres de keysym], esperado)
TESTS = [
    ("T1", "dead_acute + a  -> tilde normal",       ["dead_acute", "a"],          "á"),
    ("T2", "dead_acute + t  -> DEAD KEY CANCELADA", ["dead_acute", "t"],          "´t"),
    ("T3", "dead_acute + espacio",                  ["dead_acute", "space"],      "´"),
    ("T4", "dead_acute + dead_acute",               ["dead_acute", "dead_acute"], "´´"),
    ("T5", "enye directa",                          ["ntilde"],                   "ñ"),
    ("T6", "dead_diaeresis + u",                    ["dead_diaeresis", "u"],      "ü"),
    ("T7", "arroba (AltGr en teclado real)",        ["at"],                       "@"),
    ("T8", "euro (AltGr en teclado real)",          ["EuroSign"],                 "€"),
]

_km = None
def keycode_for(keyval):
    """Keycode fisico plausible para el keyval; 0 si el layout no lo tiene."""
    global _km
    if _km is None:
        _km = Gdk.Keymap.get_for_display(Gdk.Display.get_default())
    ok, entries = _km.get_entries_for_keyval(keyval)
    return entries[0].keycode if ok and entries else 0


class Driver:
    def __init__(self):
        self.i = 0
        self.phase = 0                      # 0 = webview, 1 = GtkTextView nativo
        self.dom, self.nat, self.seqs = {}, {}, {}

        self.win = Gtk.Window(title="spike-deadkeys")
        self.win.set_default_size(760, 380)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)

        self.web = WebKit2.WebView()
        self.web.set_size_request(760, 250)
        self.web.connect("load-changed", self.on_load)
        box.pack_start(self.web, True, True, 0)

        self.native = Gtk.TextView()
        self.native.set_size_request(760, 120)
        box.pack_start(self.native, False, False, 0)

        self.win.add(box)
        self.win.connect("destroy", Gtk.main_quit)
        self.win.show_all()
        self.web.load_uri("file://" + PAGE)

    def on_load(self, web, event):
        if event != WebKit2.LoadEvent.FINISHED:
            return
        def sh(cmd, default="?"):
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                return r.stdout.strip() or default
            except Exception:
                return default
        ver = sh(["dpkg-query", "-W", "-f=${Version}", "libwebkit2gtk-4.1-0"])
        print(f"WebKitGTK: {ver}")
        print(f"GTK: {Gtk.get_major_version()}.{Gtk.get_minor_version()}.{Gtk.get_micro_version()}")
        print("Layout X: " + sh(["setxkbmap", "-query"]).replace("\n", " | "))
        print(f"Modulo IM de GTK: {os.environ.get('GTK_IM_MODULE') or '(por defecto: simple)'}\n")
        GLib.timeout_add(700, self.focus_and_run)

    def focus_and_run(self):
        self.win.present()
        self.run_test()
        return False

    def run_test(self):
        if self.i >= len(TESTS):
            if self.phase == 0:
                self.phase, self.i = 1, 0
                print("--- pasada nativa (GtkTextView) ---")
                GLib.timeout_add(300, lambda: (self.run_test(), False)[1])
                return
            return self.report()

        tid, desc, keys, exp = TESTS[self.i]
        if self.phase == 0:
            self.web.grab_focus()
            self.js("window.__reset()", lambda _: GLib.timeout_add(
                150, lambda: (self.inject(keys), False)[1]))
        else:
            self.native.get_buffer().set_text("")
            self.native.grab_focus()
            GLib.timeout_add(150, lambda: (self.inject(keys), False)[1])

    def inject(self, keys, n=0, target=None):
        """Inyecta pulsaciones como GdkEventKey en la cola de eventos.

        Mismo enfoque que en macOS (NSApp.postEvent): se meten en la cola del
        toolkit, no en la capa HID, asi que pasan por el GtkIMContext del widget
        --que es donde vive el compose de dead keys--. Que `dead_acute`+`a`
        produzca `á` es la prueba de que la maquina de composicion corrio.
        """
        if target is None:
            target = self.web if self.phase == 0 else self.native
        if n >= len(keys):
            GLib.timeout_add(450, lambda: (self.collect(), False)[1])
            return

        keyval = Gdk.keyval_from_name(keys[n])
        kc = keycode_for(keyval)
        win = self.win.get_window()
        self._t = getattr(self, "_t", 1000) + 40

        for etype in (Gdk.EventType.KEY_PRESS, Gdk.EventType.KEY_RELEASE):
            ev = Gdk.Event.new(etype)
            ev.window = win
            ev.send_event = 1
            ev.time = self._t
            ev.state = Gdk.ModifierType(0)
            ev.keyval = keyval
            ev.hardware_keycode = kc
            ev.group = 0
            ev.is_modifier = 0
            ev.put()
            self._t += 45

        GLib.timeout_add(160, lambda: (self.inject(keys, n + 1, target), False)[1])

    def js(self, script, cb):
        def done(web, res, _):
            try:
                val = web.run_javascript_finish(res).get_js_value().to_string()
            except Exception as e:
                val = None
            cb(val)
        self.web.run_javascript(script, None, done, None)

    def collect(self):
        tid = TESTS[self.i][0]
        if self.phase == 1:
            buf = self.native.get_buffer()
            self.nat[tid] = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False)
            self.i += 1
            return self.run_test()

        def got(raw):
            value, seq = "<error>", ""
            try:
                o = json.loads(raw)
                value = o.get("value", "")
                parts = []
                for r in o.get("log", []):
                    ty = r.get("type", "?")
                    v = r.get("v")
                    tail = f"|{v}" if v is not None else ""
                    if ty.startswith("key"):
                        parts.append(f"{ty}({r.get('key')}){tail}")
                    else:
                        d = r.get("data")
                        parts.append(f"{ty}({d!r}){tail}")
                seq = " ".join(parts)
            except Exception:
                pass
            self.dom[tid] = value
            self.seqs[tid] = seq
            self.i += 1
            self.run_test()
        self.js("window.__read()", got)

    def report(self):
        line = "=" * 84
        print("\n" + line)
        print("CASO  DESCRIPCION                       macOS     GTK nat.  WebKitGTK  VEREDICTO")
        print(line)
        diffs, rotos = [], []
        for tid, desc, keys, exp in TESTS:
            n, d = self.nat.get(tid, ""), self.dom.get(tid, "")
            if n != d:
                diffs.append(tid)
            if n != exp or d != exp:
                rotos.append(tid)
            print(f"{tid}    {desc:<33} {exp!r:<9} {n!r:<9} {d!r:<10} "
                  f"{'coinciden' if n == d else '<-- DIVERGE'}")
        print(line)
        for tid in ("T1", "T2"):
            print(f"\n{tid} — secuencia DOM:")
            print("  " + (self.seqs.get(tid) or "<sin eventos>"))
        print("\n" + line)
        if not any(self.dom.values()) and not any(self.nat.values()):
            print("INCONCLUYENTE: no llego nada a ninguno de los dos. Problema de")
            print("foco X o de inyeccion, no del motor.")
        elif "T2" in diffs:
            print("BUG REPRODUCE en T2: WebKitGTK diverge del texto nativo GTK.")
            print("-> Tauri descartado en Linux.")
        elif diffs:
            print(f"T2 pasa, pero divergen {diffs}. Revisar a mano.")
        elif rotos:
            print("SIN DIVERGENCIA en 8/8: WebKitGTK se comporta igual que un")
            print("GtkTextView nativo.")
            print(f"\nDiferencias con macOS en {rotos}: ambos motores de Linux")
            print("coinciden entre si, asi que es como compone GTK, no un fallo.")
        else:
            print("SIN DIVERGENCIA en 8/8: WebKitGTK se comporta igual que un")
            print("GtkTextView nativo con layout espanol.")
        print(line)
        Gtk.main_quit()


d = Driver()

# Watchdog: si algo se atasca (foco X, render), informa igualmente en vez de
# colgarse para siempre.
def watchdog():
    print("\n[watchdog] 100s sin terminar; informe con lo que haya.")
    d.report()
    return False

GLib.timeout_add_seconds(100, watchdog)
Gtk.main()
