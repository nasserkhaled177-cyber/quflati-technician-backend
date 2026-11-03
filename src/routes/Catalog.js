const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});

const read = (n) => {
  const p = path.join(DATA_DIR, `${n}.json`);
  if(!fs.existsSync(p)) return [];
  try{ return JSON.parse(fs.readFileSync(p,'utf8')) }catch{ return [] }
}
const write = (n,d) => fs.writeFileSync(path.join(DATA_DIR, `${n}.json`), JSON.stringify(d,null,2));

// helper
const makeCRUD = (name) => {
  router.get(`/${name}`, (req,res) => res.json(read(name)));
  router.post(`/${name}`, (req,res) => {
    const all = read(name);
    const item = { id: Date.now().toString(), ...req.body };
    // للاقفال نحول المقاسات
    if(item.sizes && typeof item.sizes === 'string') item.sizes = item.sizes.split(',').map(s=>s.trim());
    all.push(item);
    write(name, all);
    res.json(item);
  });
  router.delete(`/${name}/:id`, (req,res) => {
    let all = read(name);
    all = all.filter(x=> String(x.id) !== String(req.params.id));
    write(name, all);
    res.json({ok:true});
  });
}

makeCRUD('locks');
makeCRUD('doors');
makeCRUD('additions');

router.get('/ready', (req,res) => res.json(read('ready')));
router.post('/ready', (req,res) => {
  const all = read('ready');
  all.push({ id: Date.now().toString(), ...req.body });
  write('ready', all);
  res.json({ok:true});
});
router.delete('/ready/:id', (req,res) => {
  let all = read('ready');
  all = all.filter(x=> String(x.id) !== String(req.params.id));
  write('ready', all);
  res.json({ok:true});
});

// للتوافق مع كودك القديم اللي يطلب /api/catalog مباشرة
router.post('/', (req,res) => {
  const all = read('ready');
  all.push({ id: Date.now().toString(), ...req.body });
  write('ready', all);
  res.json({ok:true});
});

module.exports = router;
