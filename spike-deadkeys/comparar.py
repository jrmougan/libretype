#!/usr/bin/env python3
"""Compara la secuencia de eventos de teclado entre WKWebView y Chromium.

El veredicto se decide en T2 (dead key cancelada): el bug reportado en WebKit
duplica el carácter muerto y se come la tecla siguiente.
"""
import json, sys, os

FILES = {"WKWebView": "resultado-wkwebview.json",
         "Chromium":  "resultado-chromium.json"}

ESPERADO = {"T1": "á", "T2": "´t", "T3": "´", "T4": "´´",
            "T5": "ñ", "T6": "ü", "T7": "@", "T8": "€"}

def cargar(path):
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        return json.load(fh)

def resultados(data):
    return {e["test"]: e.get("actual", "")
            for e in data["events"] if e.get("type") == "__RESULT__"}

def secuencia(data, test):
    out = []
    for e in data["events"]:
        if e.get("test") != test or e.get("type") == "__RESULT__":
            continue
        t = e["type"]
        if t.startswith("key"):
            out.append(f"{t}({e.get('key')!r},{e.get('code')})")
        elif t.startswith("composition"):
            out.append(f"{t}({e.get('data')!r})")
        else:
            out.append(f"{t}({e.get('data')!r},{e.get('inputType')})")
    return out

def main():
    datos = {}
    for motor, path in FILES.items():
        d = cargar(path)
        if d is None:
            print(f"FALTA: {path} — ejecuta el spike en {motor} primero.")
        else:
            datos[motor] = d
    if len(datos) < 2:
        sys.exit(1)

    print("=" * 74)
    print(f"{'CASO':<6} {'ESPERADO':<10} {'WKWEBVIEW':<14} {'CHROMIUM':<14} VEREDICTO")
    print("=" * 74)

    divergencias, fallos = [], []
    for test, esp in ESPERADO.items():
        w = resultados(datos["WKWebView"]).get(test)
        c = resultados(datos["Chromium"]).get(test)
        if w is None or c is None:
            print(f"{test:<6} {esp:<10} {'(sin dato)':<14} {'(sin dato)':<14} —")
            continue
        ok_w, ok_c = w == esp, c == esp
        if ok_w and ok_c:
            v = "ambos OK"
        elif ok_c and not ok_w:
            v = "*** SOLO WKWEBVIEW FALLA ***"; divergencias.append(test)
        elif ok_w and not ok_c:
            v = "solo Chromium falla"; divergencias.append(test)
        else:
            v = "ambos fallan"; fallos.append(test)
        print(f"{test:<6} {esp:<10} {w!r:<14} {c!r:<14} {v}")

    print("\n" + "=" * 74)
    print("T2 — DEAD KEY CANCELADA (el caso que decide el stack)")
    print("=" * 74)
    for motor in ("WKWebView", "Chromium"):
        print(f"\n{motor}:")
        for paso in secuencia(datos[motor], "T2"):
            print(f"    {paso}")

    print("\n" + "=" * 74)
    if "T2" in divergencias:
        print("VEREDICTO: el bug de WKWebView REPRODUCE. Tauri queda descartado")
        print("           salvo que aceptes un workaround sobre el nucleo del producto.")
    elif divergencias:
        print(f"VEREDICTO: divergencias entre motores en {divergencias}, pero T2 pasa.")
        print("           Revisa caso por caso antes de decidir.")
    elif fallos:
        print(f"VEREDICTO: {fallos} fallan en AMBOS motores -> no es argumento de stack,")
        print("           es complejidad que asumes elijas lo que elijas.")
    else:
        print("VEREDICTO: sin divergencia. El argumento que descartaba a Tauri NO se")
        print("           sostiene -> Tauri vuelve con su ventaja de recursos intacta.")
    print("=" * 74)

main()
