/**
 * Faz 13 — test koşumları arası temizlik yardımcısı.
 * Önceki koşumlardan kalan yetim sync taslaklarını (tüm SOAP alanları boş
 * draft'lar — seed muayene kaydı SOAP içerdiği için korunur) ve yarım kalmış
 * 'processing' sync işlem satırlarını siler.
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const p = new PrismaClient();
  try {
    const del = await p.encounter.deleteMany({
      where: {
        status: 'draft',
        chiefComplaint: null,
        subjective: null,
        objective: null,
        assessment: null,
        plan: null,
        notes: null,
      },
    });
    console.log('yetim taslak temizliği:', del.count);
    const orphan = await p.syncOperation.findMany({
      where: { status: 'processing' },
      select: { id: true },
    });
    await p.syncOperation.deleteMany({ where: { id: { in: orphan.map((o) => o.id) } } });
    console.log('processing kalıntısı:', orphan.length);
  } finally {
    await p.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
