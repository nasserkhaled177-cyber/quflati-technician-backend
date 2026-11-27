require('dotenv').config();
const express = require("express")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const jwt = require("jsonwebtoken")
const authRoutes = require("./routes/authRoutes")
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
  try{ await prisma.technician.update({ where:{ id: technicianId }, data:{ totalJobs: { increment: 1 }, status: "شغال" }}) }catch{}
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
  const techs = await prisma.technician.findMany({
    where: buildTechnicianScope(req),
    orderBy:{ totalJobs:"desc" },
    select:{ id:true, name:true, phone:true, email:true, city:true, country:true, countryCode:true, province:true, specialty:true, rating:true, lat:true, lng:true, isOnline:true, status:true, totalJobs:true, createdAt:true, updatedAt:true }
  }).catch(()=>[])
  res.json(techs)
})
app.get("/api/technicians/locations", async (req,res)=>{
  const techs = await prisma.technician.findMany({
    where: buildTechnicianScope(req),
    select:{ id:true, name:true, phone:true, lat:true, lng:true, status:true, isOnline:true, totalJobs:true, rating:true, city:true, specialty:true }
  }).catch(()=>[])
  // توحيد الاسماء للخريطة: lat/lng + isAvailable
  const fixed = techs.map(t=>({
    ...t,
    latitude: t.lat,
    longitude: t.lng,
    isAvailable: t.isOnline && t.status==="متاح"
  }))
  res.json(fixed)
})
// الفني يرسل موقعه كل 30 ثانية
app.patch("/api/technicians/:id/location", async (req,res)=>{
  const { id } = req.params
  const { lat, lng, latitude, longitude, isAvailable, status } = req.body
  const finalLat = lat ?? latitude
  const finalLng = lng ?? longitude
  try{
    const current = await prisma.technician.findUnique({ where:{ id }, select:{ locationLocked:true, countryCode:true, province:true, city:true } })
    const data = {
      lat: finalLat ? parseFloat(finalLat) : undefined,
      lng: finalLng ? parseFloat(finalLng) : undefined,
      isOnline: isAvailable !== undefined ? !!isAvailable : undefined,
      status: status || (isAvailable === false ? "غير متاح" : "متاح"),
      lastLocationAt: (finalLat && finalLng) ? new Date() : undefined,
      lastSeenAt: new Date(),
    }
    // لو الدولة مقفلة، لا تغيرها أبداً - حتى لو سافر الفني
    if(!current?.locationLocked){
      if(req.body.countryCode) data.countryCode = req.body.countryCode
      if(req.body.province || req.body.city) data.province = req.body.province || req.body.city
      if(req.body.city) data.city = req.body.city
    }
    const updated = await prisma.technician.update({ where:{ id }, data })
    res.json({ ok:true, technician: { id: updated.id, lat: updated.lat, lng: updated.lng, status: updated.status, lastLocationAt: updated.lastLocationAt } })
  }catch(e){ res.status(500).json({ error: e.message }) }
})
// تجميد / تنشيط من الأدمن
app.patch("/api/technicians/:id/status", async (req,res)=>{
  const { id } = req.params
  const { status } = req.body // متاح / موقوف / معلق / محظور
  const isSuspended = status === 'موقوف' || status === 'معلق' || status === 'محظور' || status === 'مجمد'
  const updated = await prisma.technician.update({
    where:{ id },
    data:{
      status,
      isOnline: isSuspended ? false : (status === 'متاح' ? true : undefined),
    }
  })
  res.json(updated)
})
// تعديل حسابي - الفني يعدل اسمه وصورته وسيرته ومسافة الاستقبال وكلمة السر
// ممنوع يعدل: country + countryCode + province + city
app.patch("/api/technicians/:id/profile", async (req,res)=>{
  const { id } = req.params
  // ✅ phone شلناه - ثابت ما يتغير من البروفايل - يجي من التوكن
  const { name, photo, bio, specialty, radiusKm, password, email } = req.body
  try{
    const data = {}
    if(name !== undefined) data.name = name
    // ✅ photo يقبل null عشان الحذف - اذا null تنحذف
    if(photo !== undefined) data.photo = photo
    if(bio !== undefined) data.bio = bio
    if(specialty !== undefined) data.specialty = specialty
    if(radiusKm !== undefined) data.radiusKm = parseInt(radiusKm)
    if(email !== undefined) data.email = email
    if(password){
      const bcrypt = require('bcryptjs')
      data.password = await bcrypt.hash(password, 10)
    }
    const updated = await prisma.technician.update({
      where:{ id }, data,
      select:{ id:true, name:true, phone:true, photo:true, bio:true, specialty:true, radiusKm:true, city:true, province:true, country:true, countryCode:true, rating:true, email:true,
    isOnline:true, status:true }
    })
    res.json({ ok:true, technician: updated })
  }catch(e){ res.status(500).json({ error: e.message }) }
})
// زر متاح / غير متاح - يفتح شفت ويحسب الساعات
app.patch("/api/technicians/:id/online", async (req,res)=>{
  const { id } = req.params
  const { isOnline } = req.body
  try{
    if(isOnline){
      // ✅ اذا هو اصلا متاح وعنده شفت مفتوح - لا نفتح شفت ثاني - نحدث lastSeenAt بس
      const already = await prisma.technicianShift.findFirst({ where:{ technicianId: id, status:'open' }, orderBy:{ startedAt:'desc' } })
      if(!already){
        await prisma.technicianShift.create({ data:{ technicianId: id, startedAt: new Date(), status:'open' } })
      }
      const updated = await prisma.technician.update({ where:{ id }, data:{ isOnline:true, status:'متاح', lastSeenAt: new Date() }, select:{ id:true, name:true, isOnline:true, status:true } })
      return res.json({ ok:true, technician: updated })
    } else {
      const openShift = await prisma.technicianShift.findFirst({ where:{ technicianId: id, status:'open' }, orderBy:{ startedAt:'desc' } })
      if(openShift){
        const endedAt = new Date()
        const durationMin = Math.max(0, Math.round((endedAt - openShift.startedAt)/60000))
        await prisma.technicianShift.update({ where:{ id: openShift.id }, data:{ endedAt, durationMin, status:'closed' } })
        await prisma.technician.update({ where:{ id }, data:{ totalWorkMin: { increment: durationMin } } })
      }
      const updated = await prisma.technician.update({ where:{ id }, data:{ isOnline:false, status:'غير متاح', lastSeenAt: new Date() }, select:{ id:true, name:true, isOnline:true, status:true } })
      return res.json({ ok:true, technician: updated })
    }
  }catch(e){ res.status(500).json({ error: e.message }) }
})

// ✅ نبضة - الفرونت يرسلها كل 5 دقايق وهو فاتح التطبيق - عشان نعرف انه موجود - ولا نطفيه
app.patch("/api/technicians/:id/heartbeat", async (req,res)=>{
  try{
    const { id } = req.params
    await prisma.technician.update({ where:{ id }, data:{ lastSeenAt: new Date() } })
    res.json({ ok:true })
  }catch(e){ res.status(500).json({ error: e.message }) }
})

// ✅ اوتو اوفلاين - كل 10 دقايق يشيك - مين له 6 ساعات ما دخل - يخليه غير متاح تلقائي - ويقفل شفته ويحسب ساعات شغله
setInterval(async ()=>{
  try{
    const sixHoursAgo = new Date(Date.now() - 6*60*60*1000)
    const stale = await prisma.technician.findMany({ where:{ isOnline:true, lastSeenAt:{ lt: sixHoursAgo } }, select:{ id:true } })
    if(!stale.length) return
    for(const t of stale){
      const openShift = await prisma.technicianShift.findFirst({ where:{ technicianId: t.id, status:'open' }, orderBy:{ startedAt:'desc' } })
      if(openShift){
        const endedAt = new Date()
        const durationMin = Math.max(0, Math.round((endedAt - openShift.startedAt)/60000))
        await prisma.technicianShift.update({ where:{ id: openShift.id }, data:{ endedAt, durationMin, status:'closed' } })
        await prisma.technician.update({ where:{ id: t.id }, data:{ totalWorkMin: { increment: durationMin } } })
      }
      await prisma.technician.update({ where:{ id: t.id }, data:{ isOnline:false, status:'غير متاح', lastSeenAt: new Date() } })
      console.log('⏰ auto-offline:', t.id, '- له 6 ساعات ما دخل')
    }
  }catch(e){ console.log('auto-offline error', e.message) }
}, 10*60*1000)

// العميل يقيم الفني بعد الطلب
app.post("/api/technicians/:id/rate", async (req,res)=>{
  const { id } = req.params
  const { stars, comment, customerId, customerName, orderId } = req.body
  try{
    await prisma.technicianRating.create({ data:{ technicianId: id, customerId: customerId||null, customerName: customerName||null, orderId: orderId||null, stars: parseInt(stars), comment: comment||null } })
    const all = await prisma.technicianRating.findMany({ where:{ technicianId: id }, select:{ stars:true } })
    const avg = all.reduce((s,r)=>s+r.stars,0)/all.length
    const updated = await prisma.technician.update({ where:{ id }, data:{ rating: Math.round(avg*10)/10 }, select:{ id:true, name:true, rating:true } })
    res.json({ ok:true, technician: updated, totalRatings: all.length })
  }catch(e){ res.status(500).json({ error: e.message }) }
})

// العملاء + الأدمن يشوفون تقييمات فني
app.get("/api/technicians/:id/ratings", async (req,res)=>{
  try{
    const rows = await prisma.technicianRating.findMany({ where:{ technicianId: req.params.id }, orderBy:{ createdAt:'desc' }, take: 20 })
    res.json(rows)
  }catch(e){ res.status(500).json({ error: e.message }) }
})

// الأدمن يشوف ساعات فني - متى متاح ومتى غير متاح
app.get("/api/admin/technicians/:id/shifts", async (req,res)=>{
  try{
    const shifts = await prisma.technicianShift.findMany({ where:{ technicianId: req.params.id }, orderBy:{ startedAt:'desc' }, take: 30 })
    const tech = await prisma.technician.findUnique({ where:{ id: req.params.id }, select:{ id:true, name:true, isOnline:true, status:true, totalWorkMin:true } })
    const today = new Date().toISOString().slice(0,10)
    const todayMin = shifts.filter(s=>s.startedAt.toISOString().slice(0,10)===today).reduce((sum,s)=>sum+(s.durationMin||0),0)
    res.json({ technician: tech, todayMin, todayHours: (todayMin/60).toFixed(1), shifts: shifts.map(s=>({ date: s.startedAt.toISOString().slice(0,10), from: s.startedAt.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}), to: s.endedAt ? s.endedAt.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) : 'لسه متاح', durationMin: s.durationMin })) })
  }catch(e){ res.status(500).json({ error: e.message }) }
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
      متاح:  techs.filter(t=>t.status==="متاح" && t.isOnline).length,
      شغال:  techs.filter(t=>t.status==="شغال").length,
      غير_متاح:  techs.filter(t=>!t.isOnline || t.status!=="متاح").length,
      تفاصيل: techs.map(t=>({
        id: t.id, name: t.name, phone: t.phone,
        status: t.status, متاح: t.isOnline, شغال: t.status==="شغال",
        موقع: t.lat ? `${t.lat},${t.lng}` : "لا يوجد",
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
app.use("/auth", authRoutes)
app.use("/api/auth", authRoutes)
app.listen(PORT, "0.0.0.0", ()=> console.log(`🚀 فني باكند شغال http://0.0.0.0:${PORT}`))
