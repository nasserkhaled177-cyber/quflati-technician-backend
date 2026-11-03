const express = require("express")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3002
app.use(cors({ origin: "*" }))
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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

// ===== 1. الطلبات =====
app.post("/api/installation-requests", upload.array("media", 10), async (req,res)=>{
  try{
    const { city, address, googleLink, latitude, longitude, note, paymentMethod, type, customerName, customerPhone } = req.body
    const media = (req.files||[]).map(f=>`/uploads/${f.filename}`)
    const orderNumber = "QF-"+Date.now().toString().slice(-6)
    const request = await prisma.installationRequest.create({
      data: {
        orderNumber,
        customerName: customerName || "عميل قفلاتي",
        customerPhone: customerPhone || "777000000",
        city, address, googleLink,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        note, paymentMethod, type,
        media: JSON.stringify(media)
      }
    })
    console.log("✅ طلب جديد:", orderNumber)
    res.json({ success:true, orderNumber, request })
  }catch(e){ console.error(e); res.status(500).json({ error: e.message }) }
})

app.get("/api/technician/requests", async (req,res)=>{
  const { lat, lng, radius=50 } = req.query
  const all = await prisma.installationRequest.findMany({ where:{ status:"جارية" }, orderBy:{ createdAt:"desc" } })
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
  const requests = await prisma.installationRequest.findMany({ where, orderBy:{ createdAt:"desc" } })
  res.json(requests)
})

app.put("/api/installation-requests/:id/accept", async (req,res)=>{
  const { id } = req.params
  const { technicianId } = req.body
  const updated = await prisma.installationRequest.update({ where:{ id }, data:{ status:"مقبولة", technicianId } })
  try{ await prisma.technician.update({ where:{ id: technicianId }, data:{ totalJobs: { increment: 1 }, status: "شغال" }}) }catch{}
  res.json(updated)
})

app.put("/api/installation-requests/:id/complete", async (req,res)=>{
  const { id } = req.params
  const updated = await prisma.installationRequest.update({ where:{ id }, data:{ status:"مكتملة" } })
  if(updated.technicianId){
    try{ await prisma.technician.update({ where:{ id: updated.technicianId }, data:{ status: "متاح" }}) }catch{}
  }
  res.json(updated)
})

// ===== 2. كتالوج الابواب =====
app.post("/api/catalog/door", upload.single("image"), async (req,res)=>{
  try{
    const { name, thickness, minSize, maxSize, doorType } = req.body
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image || null)
    const door = await prisma.doorType.create({ data:{ name: name || doorType, thickness, minSize:parseInt(minSize||0), maxSize:parseInt(maxSize||100), image } })
    res.json(door)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.post("/api/catalog/doors", upload.single("image"), async (req,res)=>{
  try{
    const { name, thickness, minSize, maxSize, doorType } = req.body
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image || null)
    const door = await prisma.doorType.create({ data:{ name: name || doorType, thickness, minSize:parseInt(minSize||0), maxSize:parseInt(maxSize||100), image } })
    res.json(door)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.get("/api/catalog/doors", async (req,res)=>{ res.json(await prisma.doorType.findMany({ orderBy:{ createdAt:"desc" }})) })
app.delete("/api/catalog/door/:id", async (req,res)=>{ await prisma.doorType.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })
app.delete("/api/catalog/doors/:id", async (req,res)=>{ await prisma.doorType.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })

// ===== 3. كتالوج الاقفال =====
app.post("/api/catalog/lock", upload.single("image"), async (req,res)=>{
  try{
    const { name, desc, price, productPrice, installPrice, minSize, maxSize, compatible } = req.body
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image || null)
    const lock = await prisma.lockProduct.create({ data:{ name, desc, price:parseFloat(price||productPrice||0), installPrice:parseFloat(installPrice||0), minSize:parseInt(minSize||0), maxSize:parseInt(maxSize||100), compatible, image } })
    res.json(lock)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.post("/api/catalog/locks", upload.single("image"), async (req,res)=>{
  try{
    const { name, desc, price, productPrice, installPrice, minSize, maxSize, compatible } = req.body
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image || null)
    const lock = await prisma.lockProduct.create({ data:{ name, desc, price:parseFloat(price||productPrice||0), installPrice:parseFloat(installPrice||0), minSize:parseInt(minSize||0), maxSize:parseInt(maxSize||100), compatible, image } })
    res.json(lock)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.get("/api/catalog/locks", async (req,res)=>{
  const { doorSize } = req.query
  let locks = await prisma.lockProduct.findMany({ orderBy:{ price:"asc" }})
  if(doorSize){ const s = parseInt(doorSize); locks = locks.filter(l=> s >= l.minSize && s <= l.maxSize) }
  res.json(locks)
})
app.delete("/api/catalog/lock/:id", async (req,res)=>{ await prisma.lockProduct.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })
app.delete("/api/catalog/locks/:id", async (req,res)=>{ await prisma.lockProduct.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })

// ===== 4. إضافات =====
app.post("/api/catalog/addition", async (req,res)=>{
  try{
    const { title, installPrice, doorTypeId, doorId, taxNote } = req.body
    const add = await prisma.addition.create({ data:{ title, installPrice:parseFloat(installPrice||0), doorTypeId: doorTypeId || doorId || "general", taxNote } })
    res.json(add)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.post("/api/catalog/additions", async (req,res)=>{
  try{
    const { title, installPrice, doorTypeId, doorId, taxNote } = req.body
    const add = await prisma.addition.create({ data:{ title, installPrice:parseFloat(installPrice||0), doorTypeId: doorTypeId || doorId || "general", taxNote } })
    res.json(add)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.get("/api/catalog/additions", async (req,res)=>{ res.json(await prisma.addition.findMany({ orderBy:{ createdAt:"desc" }})) })
app.delete("/api/catalog/addition/:id", async (req,res)=>{ await prisma.addition.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })
app.delete("/api/catalog/additions/:id", async (req,res)=>{ await prisma.addition.delete({ where:{ id:req.params.id } }); res.json({ok:true}) })

// ===== 5. الجاهز للمتجر العام =====
app.get("/api/catalog/ready", async (req,res)=>{ res.json(await prisma.readyItem.findMany({ orderBy:{ createdAt:"desc" }})) })
app.post("/api/catalog/ready", async (req,res)=>{
  try{ const item = await prisma.readyItem.create({ data: req.body }); res.json(item) }catch(e){ res.status(500).json({ error: e.message }) }
})
app.post("/api/catalog", async (req,res)=>{
  try{ const item = await prisma.readyItem.create({ data: req.body }); res.json(item) }catch(e){ res.status(500).json({ error: e.message }) }
})
app.delete("/api/catalog/ready/:id", async (req,res)=>{ await prisma.readyItem.delete({ where:{ id:req.params.id }}); res.json({ok:true}) })
app.delete("/api/catalog/:id", async (req,res)=>{ await prisma.readyItem.delete({ where:{ id:req.params.id }}); res.json({ok:true}) })

// ===== 6. مطابقة اقفال حسب السماكة =====
app.post("/api/match-locks", async (req,res)=>{
  const { thickness } = req.body
  const s = parseInt(thickness)
  const locks = await prisma.lockProduct.findMany()
  const matched = locks.filter(l=> s >= l.minSize && s <= l.maxSize)
  res.json(matched)
})

// ===== 7. الفنيين =====
app.get("/api/technicians", async (req,res)=>{
  const techs = await prisma.technician.findMany({ orderBy:{ createdAt:"desc" }})
  res.json(techs)
})
app.get("/api/technicians/locations", async (req,res)=>{
  const techs = await prisma.technician.findMany({ where:{ lat:{ not: null }, lng:{ not: null }}})
  res.json(techs)
})
app.post("/api/technicians", async (req,res)=>{
  try{
    const tech = await prisma.technician.create({ data: req.body })
    res.json(tech)
  }catch(e){ res.status(500).json({ error: e.message }) }
})
app.put("/api/technicians/:id/location", async (req,res)=>{
  const { id } = req.params
  const { lat, lng, city, status, isOnline } = req.body
  const tech = await prisma.technician.update({ where:{ id }, data:{ lat: lat?parseFloat(lat):undefined, lng: lng?parseFloat(lng):undefined, city, status, isOnline }})
  res.json(tech)
})

// ===== 8. الداشبورد الشامل - يظهر في http://localhost:3002/ =====
app.get("/", async (req,res)=>{
  try{
    const [requests, techs, doors, locks, adds, ready] = await Promise.all([
      prisma.installationRequest.findMany({ orderBy:{ createdAt:"desc" }}),
      prisma.technician.findMany({ orderBy:{ createdAt:"desc" }}),
      prisma.doorType.findMany({ orderBy:{ createdAt:"desc" }}),
      prisma.lockProduct.findMany({ orderBy:{ createdAt:"desc" }}),
      prisma.addition.findMany({ orderBy:{ createdAt:"desc" }}),
      prisma.readyItem.findMany({ orderBy:{ createdAt:"desc" }}),
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
        متاح: techs.filter(t=> t.status==="متاح" && t.isOnline).length,
        شغال: techs.filter(t=> t.status==="شغال").length,
        غير_متاح: techs.filter(t=> !t.isOnline || t.status==="غير متاح").length,
        القائمة: techs.map(t=>({
          id: t.id,
          name: t.name,
          phone: t.phone,
          city: t.city,
          status: t.status,
          isOnline: t.isOnline,
          موقع: t.lat ? `${t.lat},${t.lng}` : "لا يوجد",
          googleMaps: t.lat ? `https://maps.google.com/?q=${t.lat},${t.lng}` : null,
          تقييم: t.rating,
          اشتغل: t.totalJobs,
          تخصص: t.specialty
        }))
      },
      الكتالوج: {
        ابواب: doors.length,
        اقفال: locks.length,
        اضافات: adds.length,
        جاهز: ready.length
      },
      مواقع_الطلبات: requests.map(r=>({
        orderNumber: r.orderNumber,
        city: r.city,
        lat: r.latitude,
        lng: r.longitude,
        googleLink: `https://maps.google.com/?q=${r.latitude},${r.longitude}`,
        status: r.status,
        technicianId: r.technicianId
      }))
    }

    res.json({
      ok: true,
      message: "🚀 باكند قفلاتي شغال - لوحة التحكم الشاملة",
      time: new Date().toISOString(),
      stats,
      endpoints: {
        catalog: ["/api/catalog/doors","/api/catalog/locks","/api/catalog/additions","/api/catalog/ready"],
        requests: ["/api/installation-requests","/api/technician/requests?lat=24.7136&lng=46.6753"],
        technicians: ["/api/technicians","/api/technicians/locations"]
      }
    })
  }catch(e){
    res.status(500).json({ ok:false, error: e.message, stack: e.stack })
  }
})

app.listen(PORT, "0.0.0.0", ()=> console.log(`🚀 فني باكند شغال http://0.0.0.0:${PORT}`))
