// Bestandsopslag voor versies: één JSON-bestand, atomisch weggeschreven (tmp + rename).
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

const readList = async (file) => {
  try {
    const list = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(list)) throw new Error(`Ongeldige inhoud in ${file}`);
    return list;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
};

/**
 * @param {string} file pad naar het JSON-bestand
 * @returns {Promise<{list: () => object[], count: () => number, has: (id: string) => boolean,
 *   put: (record: object) => Promise<void>, remove: (id: string) => Promise<boolean>}>}
 */
export async function createStore(file) {
  await mkdir(dirname(file), {recursive: true});
  let records = new Map((await readList(file)).map((r) => [r.id, r]));
  let queue = Promise.resolve();

  const persist = (next) => {
    const job = queue.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify([...next.values()]), {mode: 0o600});
      await rename(tmp, file);
      records = next;
    });
    queue = job.catch(() => {});
    return job;
  };

  return {
    list: () => [...records.values()],
    count: () => records.size,
    has: (id) => records.has(id),
    put: (record) => persist(new Map(records).set(record.id, record)),
    remove: async (id) => {
      if (!records.has(id)) return false;
      const next = new Map(records);
      next.delete(id);
      await persist(next);
      return true;
    },
  };
}
