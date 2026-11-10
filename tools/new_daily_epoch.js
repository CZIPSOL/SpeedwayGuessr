// Wypisuje nową "epokę" puli Daily z aktualnej zawartości db.js.
// Użycie:  node tools/new_daily_epoch.js [numerDniaStartu]
// Domyślnie epoka startuje od jutrzejszego dnia (dzisiejszy zawodnik się nie zmienia).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const db = new Function(fs.readFileSync(path.join(root, 'db.js'), 'utf8') + ';return playersDB;')();
const ids = db.map(p => p.id);
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const m = script.match(/DAILY_START_DATE\s*=\s*new Date\(([^)]*)\)/);
if (!m) { console.error('Nie znalazłem DAILY_START_DATE w script.js'); process.exit(1); }
const start = new Function('return new Date(' + m[1] + ')')();
const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
const now = new Date();
const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const todayNum = Math.round((todayLocal - startLocal) / 86400000) + 1;
const fromDay = Number(process.argv[2]) || todayNum + 1;
const pool = new Function(fs.readFileSync(path.join(root, 'daily_pool.js'), 'utf8') + ';return DAILY_POOL_EPOCHS;')();
const last = pool[pool.length - 1];
const added = ids.filter(id => !last.ids.includes(id));
const removed = last.ids.filter(id => !ids.includes(id));
console.error('Dzisiaj to dzień #' + todayNum + '. Nowa epoka od dnia #' + fromDay + '.');
console.error('Nowi zawodnicy w puli: ' + (added.length ? added.join(', ') : '(brak)'));
if (removed.length) console.error('UWAGA: ID usunięte z db.js, a obecne w poprzedniej puli: ' + removed.join(', '));
console.log(',\n    {\n        fromDay: ' + fromDay + ',\n        ids: [' + ids.join(', ') + ']\n    }');
