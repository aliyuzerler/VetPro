#!/usr/bin/env python3
"""
Vitest/esbuild decorator metadata üretmediği için NestJS bağımlılıkları açık
@Inject(...) ile çözümlenmelidir. Bu codemod, constructor içindeki
`private readonly x: X` parametrelerini (zaten @Inject'li olanlar hariç)
`@Inject(X) private readonly x: X` biçimine çevirir ve eksik `Inject` import'unu ekler.
"""
import re
import sys
from pathlib import Path

FILES = [
    "auth/auth.service.ts", "auth/auth.controller.ts",
    "audit/audit.service.ts", "audit/audit.controller.ts",
    "clinic/clinic.service.ts", "clinic/clinic.controller.ts",
    "branches/branches.service.ts", "branches/branches.controller.ts",
    "rooms/rooms.service.ts", "rooms/rooms.controller.ts",
    "warehouses/warehouses.service.ts", "warehouses/warehouses.controller.ts",
    "staff/staff.service.ts", "staff/staff.controller.ts",
    "roles/roles.service.ts", "roles/roles.controller.ts",
    "common/auth/jwt-auth.guard.ts", "common/auth/permissions.guard.ts",
    "common/auth/branch-scope.guard.ts",
]

ROOT = Path("/home/z/my-project/apps/api/src")

PARAM = re.compile(r"(private readonly \w+: \w+,?)")
INJECT_PREFIX = re.compile(r"@Inject\(\w+\)\s*$")


def add_inject_import(source: str) -> str:
    if re.search(r"\bInject\b", source.split("from '@nestjs/common'")[0]):
        return source  # Inject zaten import edilmiş
    return source.replace(
        "from '@nestjs/common'",
        "Inject,\n} from '@nestjs/common'" if False else "from '@nestjs/common'",
        1,
    )


def ensure_inject_import(source: str) -> str:
    # import { X, Y } from '@nestjs/common' — Inject yoksa ekle
    m = re.search(r"import \{([^}]*)\} from '@nestjs/common';", source)
    if not m:
        # import yoksa ekle
        return "import { Inject } from '@nestjs/common';\n" + source
    names = [n.strip() for n in m.group(1).split(",") if n.strip()]
    if "Inject" in names:
        return source
    names.insert(0, "Inject")
    names = sorted(set(names), key=lambda s: s.lower())
    return source[: m.start()] + "import { " + ", ".join(names) + " } from '@nestjs/common';" + source[m.end():]


def transform(source: str) -> str:
    # constructor gövdesini (parametre listesini) bul
    for ctor_match in re.finditer(r"constructor\s*\(", source):
        start = ctor_match.end()
        depth = 1
        i = start
        while i < len(source) and depth > 0:
            if source[i] == "(":
                depth += 1
            elif source[i] == ")":
                depth -= 1
            i += 1
        params = source[start : i - 1]
        lines = params.split("\n")
        new_lines = []
        for line in lines:
            m = PARAM.search(line)
            if m and "@" not in line.split(m.group(1))[0]:
                param_type = m.group(1).split(":")[1].strip().rstrip(",")
                clean_type = param_type.rstrip(",")
                replacement = f"@Inject({clean_type}) {m.group(1)}"
                line = line[: m.start()] + replacement + line[m.end() :]
            new_lines.append(line)
        patched = "\n".join(new_lines)
        if patched != params:
            source = source[:start] + patched + source[i - 1 :]
    return ensure_inject_import(source)


changed = []
for rel in FILES:
    path = ROOT / rel
    original = path.read_text()
    updated = transform(original)
    if updated != original:
        path.write_text(updated)
        changed.append(rel)

print(f"Güncellenen dosyalar ({len(changed)}):")
for rel in changed:
    print(f"  {rel}")
