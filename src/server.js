const express = require("express")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const jwt = require("jsonwebtoken")

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3002

app.use(cors({ origin: "*" }))
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// --- Scope Helper: فلترة حسب الدولة والمحافظة ---
// الادمن: بدون query = يشوف الكل
// المشرف: يرسل ?countryCode=YE&province=عدن = يشوف محافظته بس
function buildScope(req){
  const { countryCode, province, city, country } = req.query || {};
  const where = {};
  if(countryCode) where.countryCode = String(countryCode);
  else if(country) where.countryCode = String(country);
  if(province) where.province = String(province);
  else if(city) where.province = String(city);
  return where;
}
function buildTechnicianScope(req){
  const { countryCode, province, city, country } = req.query || {};
  const where = {};
  if(countryCode) where.countryCode = String(countryCode);
  else if(country) where.countryCode = String(country);
  if(province) where.province = String(province);
  else if(city) where.city = String(city);
  return where;
}


const storage = multer.diskStorage({
  destination: (req,file,cb)=> {
    const dir = path.join(__dirname, "../uploads")
    if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true})
    cb(null, dir)
  },
  filename: (req,file,cb)=> cb(null, Date.now()+"-"+file.originalname)
})
const upload = multer({ storage })

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2-lat1)*Math.PI/180
  const dLon = (lon2-lon1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// --- Auth Required: إجباري - لازم توكن حقيقي ---
function authRequired(req, res, next){
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if(!token) return res.status(401).json({ success:false, error: "لازم تسجل دخول أولاً" });
  try{
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "quflati-secret-change-me");
    // ندعم كل أشكال التوكن: id / userId / _id
    req.user = {
      id: decoded.id || decoded.userId || decoded._id,
      name: decoded.name || decoded.customerName || decoded.username,
      phone: decoded.phone || decoded.customerPhone || decoded.mobile,
      email: decoded.email,
    };
    if(!req.user.id || !req.user.name) return res.status(401).json({ success:false, error: "التوكن ناقص بيانات العميل" });
    next();
  }catch(e){ return res.status(401).json({ success:false, error: "التوكن منتهي أو غير صالح، سجل دخول من جديد" }); }
}

// ===== 1. الطلبات =====
app.post("/api/installation-requests", authRequired, upload.array("media", 10), async (req,res)=>{
  try{
    const { city, address, googleLink, latitude, longitude, note, paymentMethod, type, countryCode, province, country } = req.body
    const realName = req.user.name
    const realPhone = req.user.phone
    const realEmail = req.user.email || null
    const realUserId = req.user.id
    const media = (req.files||[]).map(f=>`/uploads/${f.filename}`)
    const orderNumber = "QF-"+Date.now().toString().slice(-6)
    const request = await prisma.installationRequest.create({
      data: {
        orderNumber,
        customerName: realName,
        customerPhone: realPhone,
        city, address, googleLink,
        countryCode: countryCode || country || "YE",
        province: province || city || "عدن",
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        note, paymentMethod, type,
        media: JSON.stringify(media)
      }
    })
    console.log("✅ طلب جديد:", orderNumber, "من:", realName, realPhone, `(userId:${realUserId})`)
    res.json({ success:true, orderNumber, request })
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }) }
})

app.get("/api/requests", async (req,res)=>{ try{ const where = buildScope(req); const rows = await prisma.installationRequest.findMany({ where, orderBy:{ createdAt:"desc" } }); res.json(rows); }catch(e){ res.status(500).json({error:e.message}) } });
app.get("/api/technician/requests", async (req,res)=>{
  const { lat, lng, radius=50 } = req.query
  const scope = buildScope(req)
  const all = await prisma.installationRequest.findMany({ where:{ status:"جارية", ...scope }, orderBy:{ createdAt:"desc" } })
  const filtered = all.map(r=>{
    if(!lat || !lng) return { ...r, distance: "قريب" }
    const d = getDistance(parseFloat(lat), parseFloat(lng), r.latitude, r.longitude)
    return { ...r, distance: `${d.toFixed(1)} كم`, _d: d }
  }).filter(r=> !r._d || r._d <= parseFloat(radius))
  res.json({ requests: filtered })
})

app.get("/api/installation-requests", async (req,res)=>{
  const { phone } = req.query
  const where = phone ? { customerPhone: phone } : {}
  const requests = await prisma.installationRequest.findMany({ where: { ...buildScope(req), ...where }, orderBy:{ createdAt:"desc" } })
  res.json(requests)
})

app.put("/api/installation-requests/:id/accept", async (req,res)=>{
  const { id } = req.params
  const { technicianId } = req.body
  const updated = await prisma.installationRequest.update({ where:{ id }, data:{ status:"مقبولة", technicianId } })
  // تحديث عدد شغل الفني
  try{ await prisma.technician.update({ where:{ id: technicianId }, data:{ totalJobs: { increment: 1 }, isBusy: true }}) }catch{}
  res.json(updated)
})

// ===== 2. كتالوج الابواب والاقفال =====
app.post("/api/catalog/door", upload.single("image"), async (req,res)=>{
  const { name, thickness, minSize, maxSize } = req.body
  const image = req.file ? `/uploads/${req.file.filename}` : null
  const door = await prisma.doorType.create({ data:{ name, thickness, minSize:parseInt(minSize), maxSize:parseInt(maxSize), image } })
  res.json(door)
})
app.post("/api/catalog/doors", upload.single("image"), async (req,res)=>{
  const { name, thickness, minSize, maxSize, doorType } = req.body
  const image = req.file ? `/uploads/${req.file.filename}` : null
  const door = await prisma.doorType.create({ data:{ name: name || doorType, thickness, minSize:parseInt(minSize||0), maxSize:parseInt(maxSize||100), image } })
  res.json(door)
})
app.get("/api/catalog/doors", async (req,res)=>{ res.json(await prisma.doorType.findMany({ orderBy:{ createdAt:"desc" }})) })
app.delete("/api/catalog/door/:id", async (req,res)=>{ await prisma.doorType.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })
app.delete("/api/catalog/doors/:id", async (req,res)=>{ await prisma.doorType.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })

app.post("/api/catalog/lock", upload.single("image"), async (req,res)=>{
  const { name, desc, price, installPrice, minSize, maxSize, compatible } = req.body
  const image = req.file ? `/uploads/${req.file.filename}` : null
  const lock = await prisma.lockProduct.create({ data:{ name, desc, price:parseFloat(price), installPrice:parseFloat(installPrice), minSize:parseInt(minSize), maxSize:parseInt(maxSize), compatible, image } })
  res.json(lock)
})
app.post("/api/catalog/locks", upload.single("image"), async (req,res)=>{
  const { name, desc, price, installPrice, minSize, maxSize, compatible, productPrice } = req.body
  const image = req.file ? `/uploads/${req.file.filename}` : null
  const lock = await prisma.lockProduct.create({ data:{ name, desc, price:parseFloat(price||productPrice||0), installPrice:parseFloat(installPrice||0), minSize:parseInt(minSize||0), maxSize:parseInt(maxSize||100), compatible, image } })
  res.json(lock)
})
app.get("/api/catalog/locks", async (req,res)=>{
  const { doorSize } = req.query
  let locks = await prisma.lockProduct.findMany({ orderBy:{ price:"asc" }})
  if(doorSize){ const s = parseInt(doorSize); locks = locks.filter(l=> s >= l.minSize && s <= l.maxSize) }
  res.json(locks)
})
app.delete("/api/catalog/lock/:id", async (req,res)=>{ await prisma.lockProduct.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })
app.delete("/api/catalog/locks/:id", async (req,res)=>{ await prisma.lockProduct.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })

// ===== 3. الاضافات =====
app.post("/api/catalog/addition", async (req,res)=>{
  const { title, installPrice, doorTypeId, taxNote, doorId } = req.body
  const add = await prisma.addition.create({ data:{ title, installPrice:parseFloat(installPrice||0), doorTypeId: doorTypeId || doorId || "general", taxNote } })
  res.json(add)
})
app.post("/api/catalog/additions", async (req,res)=>{
  const { title, installPrice, doorTypeId, taxNote, doorId } = req.body
  const add = await prisma.addition.create({ data:{ title, installPrice:parseFloat(installPrice||0), doorTypeId: doorTypeId || doorId || "general", taxNote } })
  res.json(add)
})
app.get("/api/catalog/additions", async (req,res)=>{ res.json(await prisma.addition.findMany({ orderBy:{ createdAt:"desc" }})) })
app.delete("/api/catalog/addition/:id", async (req,res)=>{ await prisma.addition.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })
app.delete("/api/catalog/additions/:id", async (req,res)=>{ await prisma.addition.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })

// ===== 4. الجاهز للمتجر العام =====
app.get("/api/catalog/ready", async (req,res)=>{ res.json(await prisma.readyItem.findMany({ orderBy:{ createdAt:"desc" }})) })
app.post("/api/catalog/ready", async (req,res)=>{ const item = await prisma.readyItem.create({ data: req.body }); res.json(item) })
app.post("/api/catalog", async (req,res)=>{ const item = await prisma.readyItem.create({ data: req.body }); res.json(item) })
app.delete("/api/catalog/ready/:id", async (req,res)=>{ await prisma.readyItem.delete({ where:{ id:req.params.id }}); res.json({ok:true}) })

app.post("/api/match-locks", async (req,res)=>{
  const { thickness } = req.body
  const s = parseInt(thickness)
  const locks = await prisma.lockProduct.findMany()
  const matched = locks.filter(l=> s >= l.minSize && s <= l.maxSize)
  res.json(matched)
})

// ===== 5. الفنيين - جديد =====
app.get("/api/technicians", async (req,res)=>{
  const techs = await prisma.technician.findMany({ where: buildTechnicianScope(req), orderBy:{ totalJobs:"desc" } }).catch(()=>[])
  res.json(techs)
})
app.get("/api/technicians/locations", async (req,res)=>{
  const techs = await prisma.technician.findMany({ where: buildTechnicianScope(req), select:{ id:true, name:true, phone:true, latitude:true, longitude:true, status:true, isAvailable:true, isBusy:true, totalJobs:true, rating:true } }).catch(()=>[])
  res.json(techs)
})

// ===== 6. الداشبورد الشامل - هذا اللي يطلع في / =====
app.get("/", async (req,res)=>{
  const [requests, techs, doors, locks, adds, ready] = await Promise.all([
    prisma.installationRequest.findMany({ orderBy:{ createdAt:"desc" }}).catch(()=>[]),
    prisma.technician.findMany().catch(()=>[]),
    prisma.doorType.findMany().catch(()=>[]),
    prisma.lockProduct.findMany().catch(()=>[]),
    prisma.addition.findMany().catch(()=>[]),
    prisma.readyItem.findMany().catch(()=>[]),
  ])

  const stats = {
    الطلبات: {
      الكل: requests.length,
      جارية: requests.filter(r=>r.status==="جارية").length,
      مقبولة: requests.filter(r=>r.status==="مقبولة").length,
      مكتملة: requests.filter(r=>r.status==="مكتملة").length,
    },
    الفنيين: {
      الكل: techs.length,
      متاح: techs.filter(t=>t.status==="متاح" || t.isAvailable).length,
      شغال: techs.filter(t=>t.status==="شغال" || t.isBusy).length,
      غير_متاح: techs.filter(t=>t.status==="غير متاح" || !t.isAvailable).length,
      تفاصيل: techs.map(t=>({
        id: t.id, name: t.name, phone: t.phone,
        status: t.status, متاح: t.isAvailable, شغال: t.isBusy,
        موقع: t.latitude ? `${t.latitude},${t.longitude}` : "لا يوجد",
        اشتغل: t.totalJobs || 0,
        تقييم: t.rating || 5
      }))
    },
    الكتالوج: { ابواب: doors.length, اقفال: locks.length, اضافات: adds.length, جاهز: ready.length },
    مواقع_الطلبات: requests.map(r=>({ orderNumber:r.orderNumber, city:r.city, lat:r.latitude, lng:r.longitude, status:r.status }))
  }

  res.json({ ok:true, message:"🚀 باكند قفلاتي - كل شي", stats })
})

app.use(require("./routes/index"))
app.use("/auth", require("./routes/authRoutes"))
app.listen(PORT, "0.0.0.0", ()=> console.log(`🚀 فني باكند شغال http://0.0.0.0:${PORT}`))
