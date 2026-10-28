# SARIQ HOVLI

5 kishilik onlayn 3D otishma o'yini. Har kim o'zi uchun, telefon yoki kompyuterdan, internet orqali.

O'yinchilar: **Tohir, Abdulatif, Asror, Muhammad, Sunnatulloh**. Har bir o'yinchining ismi peshona bog'ichida
(oldida va orqasida) hamda orqa yelkasida yozilgan, rangi ham har xil.

## Nima bor (3-versiya)

- **3 ta xarita**, asosiy menyudagi **Xarita** tugmasidan tanlanadi (yoki "Avto": har raundda almashadi):
  1. **Sariq Hovli:** 2 ta parallel 3 qavatli bino, o'rtada hovli va yashiklar, ichkarida zinalar.
  2. **Ochiq maydon:** binosiz katta maydon: yashiklar, konteynerlar, beton to'siqlar, past devorlar, qum tepaliklari.
  3. **Qishloq:** uylar, quduq, to'siqlar, tom ustiga zinadan chiqiladi.
  Osmon doim quyoshli.
- **5 ta o'yin rejimi** (menyudagi **Rejim** tugmasi): Klassik (do'kon bilan), Faqat snayper, Faqat pistolet, Bitta o'q (bitta o'q = o'lim),
  Oy tortishishi (baland sakraysiz, do'kon bilan).
- **5 ta qurol:** Pistolet, Avtomat (boshida bor), Mini-avtomat, Pompali miltiq, Snayper. Hammasida 400 tadan o'q.
- **Do'kon (🛒 tugmasi yoki `B`) to'liq BEPUL:** qurollar, zirh, dubulg'a. Qayta-qayta olish mumkin (o'q to'ladi, zirh tiklanadi).
- **Granatalar CHEKSIZ** (boshidan bor): portlovchi, tutun, flash/ko'z qamashtiruvchi.
- **Hayvonlar** (radarda butun xarita bo'yicha ko'rinadi, chap tepada eng yaqinigacha masofa va yo'nalish o'qi): maydonda 2 ta buqa va 2 ta cho'chqa erkin yuradi. Ularni o'ldirsangiz HP va pul qo'shiladi
  (buqa +35 HP / $400, cho'chqa +20 HP / $150). Buqaga yaqin borsangiz shoxi bilan suzadi va uloqtiradi. 25 soniyada qayta paydo bo'ladi.
- **Mo'ljal (ADS):** hamma qurolda. **MO'LJAL** tugmasi (yoki sichqonchaning o'ng tugmasi). Sozlamalarda **Avto-nishon yordami** yoqilgan.
  Otishda qurol sakramaydi: orqaga tepish silliq, nishon surilib ketmaydi.
- **Silliq modellar** (odamlar 20%, hayvonlar 30% kattalashtirilgan): yumaloq shakllar, ikki bo'g'inli qo'llar, barmoqlar; ism peshona bog'ichida (old/orqa) va orqa yelkada.
- **Boshqalar:** radar (kichik xarita), seriya o'ldirishlar (kill streak), qasos belgisi (sizni o'ldirgan odam ustida),
  devor orqali o'q (yupqa devorlardan o'tadi, zarar kamayadi), o'ldirgan odamga qarab turish (kill-cam),
  raund oxirida **medallar** va umumiy statistika, o'tirib o'q otganda aniqroq / yugurganda tarqoqroq o'q, sintez qilingan tovushlar.
- **Qoidalar:** har kim o'zi uchun. 20 ta o'ldirgan yutadi yoki 5 daqiqadan keyin eng ko'p o'ldirgan yutadi.
  Raund tugagach natijalar chiqadi va keyingi raund boshlanadi. O'lgan 3 soniyadan keyin qayta tug'iladi.
- **Menyuda:** O'YNASH, Xarita, Rejim, Sozlamalar (sezgirlik, mo'ljal sezgirligi, ovoz, sifat, avto-nishon, radar).

## Boshqaruv

| Telefon | Kompyuter |
|---|---|
| Chap tomonda barmoqni surish: yurish (joystik) | `W A S D` |
| O'ng tomonni surish: qarash | sichqoncha |
| Qizil **OTISH** tugmasi (bosib turib ham qarash mumkin) | chap tugma |
| **MO'LJAL** (bosib yoqish/o'chirish) | o'ng tugma (ushlab turish) |
| **SAKRA**, **ZARYAD** | `Space`, `R` |
| **O'TIR** (o'ng pastki burchak) | `C` yoki `Ctrl` |
| **GRANATA** (tashlash) va granata turini almashtirish | `G` va `Q` |
| 🛒 do'kon | `B` |
| Pastdagi qurol qutilari | `1`–`5` |
| ☰ pauza | `Esc` |

## Ishga tushirish (3 qadam)

O'yin ikki qismdan iborat: **server** (hamma ulanadigan joy) va **klient** (APK yoki brauzer).
Do'stlaringiz turli joyda bo'lgani uchun server internetda turishi kerak.

### 1-qadam: serverni internetga qo'yish

**A) Render.com (bepul, kompyuter yoqilmagan bo'lsa ham ishlaydi)**
1. GitHub'da yangi repo oching va shu papkadagi fayllarni yuklang (`node_modules`, `apk/android` kerak emas).
2. render.com'ga GitHub orqali kiring, **New + → Web Service** → shu repo'ni tanlang. `render.yaml` hamma sozlamani o'zi beradi,
   tarifni **Free** qoldiring.
3. Bir necha daqiqadan keyin manzil chiqadi, masalan `https://sariq-hovli-abcd.onrender.com`.
   Bepul tarifda server 15 daqiqa hech kim kirmasa uxlaydi. Birinchi kirishda uyg'onishi 30-60 soniya olishi mumkin.

**B) O'z kompyuteringizda (Node.js 18+ o'rnatilgan bo'lsa)**
```
npm install
npm start
```
Server `http://localhost:3000` da ochiladi. Do'stlar ulanishi uchun tunnel kerak, masalan Cloudflare (bepul):
```
cloudflared tunnel --url http://localhost:3000
```
U `https://....trycloudflare.com` ko'rinishidagi manzil beradi. Kompyuter yoqilgan va server ishlab turishi shart.

### 2-qadam: APK'ni o'rnatish

1. `dist/SariqHovli.apk` faylini Telegram guruhga tashlang.
2. Har kim yuklab olib o'rnatadi. Android "noma'lum manba" ruxsatini so'raydi: ruxsat bering.
3. O'yinni oching, **Server** maydoniga 1-qadamdagi manzilni yozing (masalan `sariq-hovli-abcd.onrender.com`) va **Ulash** ni bosing.
   Manzil telefonda eslab qolinadi, keyingi safar kiritilmaydi.
4. Ismingizni tanlang va **O'YNASH** ni bosing. Bir ismni ikki kishi tanlay olmaydi.

APK shart emas: serverning manzilini telefon yoki kompyuter brauzerida ochsangiz ham o'ynash mumkin.

### 3-qadam (ixtiyoriy): manzilni APK ichiga yozib qo'yish

Do'stlar manzil yozmasligi uchun APK'ni server manzili bilan qayta yig'ing:
```
cd apk
SERVER_URL=sariq-hovli-abcd.onrender.com ./build-apk.sh
```
Yoki GitHub'da: repo → Settings → Secrets and variables → Actions → Variables → `SERVER_URL` qo'shing,
so'ng Actions → "APK yig'ish" → Run workflow. Tayyor APK "Artifacts" bo'limida chiqadi.

## APK'ni qo'lda yig'ish

Kerak: Node 18+, JDK 17+, Android SDK (`ANDROID_HOME`), Python 3 + `pip install pillow`.
```
cd apk
./build-apk.sh
```
Natija: `dist/SariqHovli.apk` (debug kalit bilan imzolangan, to'g'ridan-to'g'ri o'rnatiladi; Play Market uchun emas).

## Sinash

```
npm run test              # fizika: zinalar, eshiklar, devorlar
npm start &               # server
node test/bots.mjs        # server mantig'i: otish, o'ldirish, zaryad, ism bandligi
# boshqa testlar: test/economy.mjs (PORT=3001), test/config-animals.mjs (PORT=3002 ROUND_SEC=9 END_SEC=3), test/rotate.mjs
```

## Sozlash

- `client/shared/consts.js` — qurollar (zarar, tezlik, o'q soni), HP, raund vaqti, g'alaba uchun o'ldirish soni, ismlar va ranglar.
- `client/shared/map.js` — 3 ta xarita. Binolar, yashiklar, tug'ilish nuqtalari shu yerda.
- Server muhit o'zgaruvchilari: `PORT`, `ROUND_SEC`, `END_SEC`, `KILL_LIMIT`, `START_MAP`, `START_MODE`, `NO_ANIMALS`.
- `server/server.js` — server. `PORT` muhit o'zgaruvchisi bilan port tanlanadi.

## Muammolar

| Muammo | Yechim |
|---|---|
| "Serverga ulanmoqda…" turib qoladi | Render serveri uxlagan bo'lishi mumkin, 1 daqiqa kuting. Manzil to'g'riligini tekshiring |
| "Ismi band" | Shu ismni boshqa kishi tanlagan yoki avvalgi ulanish hali uzilmagan; 5 soniyadan keyin qayta urining |
| Kechikish (ping baland) | Chap yuqori burchakda ping ko'rinadi. Wi-Fi yoki yaqinroq server (Render'da Frankfurt) yordam beradi |
| Telefon sekin ishlayapti | ☰ → Sifat: "Past" |

## Eslatmalar

- Eski (v1/v2) APK'lar yangi server bilan ishlamaydi: hamma yangi APK'ni o'rnatishi kerak.
- Server har bir o'yinchining joyini o'yinchining o'zidan oladi (do'stlar o'rtasida o'ynash uchun yetarli), o'q tegishi, zarar, hisob esa
  serverda hisoblanadi.
- O'yin faqat 5 ta belgilangan ism uchun mo'ljallangan.


---

# POYGA (mashina poygasi)

5 kishilik onlayn 3D mashina poygasi. **Sariq Hovli bilan bir xil serverda** ishlaydi (qo'shimcha server, qo'shimcha sozlash kerak emas):
o'yin manzili `https://<server>/poyga/`, tarmoq yo'li `/ws2` (Sariq Hovli `/ws` da ishlashda davom etadi).

- **Mashinalar:** Tohir — Nexia 3, Abdulatif — Nexia 2, Asror — Mercedes W211, Muhammad — Cobalt, Sunnatulloh — Matiz.
  Kuch, tezlik va burilish **hammasida bir xil** — farqi faqat ko'rinishida. 5 ta rang: oq, kulrang, qora, yashil, sariq (kutish zalida almashtirish mumkin).
- **3 ta trek:** Qishloq yo'li, Cho'l yo'li, Shahar aylanasi (har biri taxminan 2.4–2.8 km, 1 aylana ≈ 1 daqiqa).
- **Poyga turlari:** Qisqa (1 aylana), Oddiy (3), Uzun (5).
- **Bo'sh o'rinlarga botlar** qo'yiladi (har doim 5 ta mashina).
- **Kutish zali:** trek va tur uchun ovoz berish, rang tanlash, "Tayyorman". Hamma odam tayyor bo'lsa poyga boshlanadi.
- **Sovg'a qutilari (?):** tezlashtirish, qalqon, tuman (oldingilarga), moy dog'i (orqangdagilarga).
- Nitro (drift qilganda to'ladi), signal, "Qaytarish" (yo'lga qaytaradi), tezlik o'lchagich (km/h), o'rin (2/5), aylana hisobi, minixarita,
  teskari yo'nalish ogohlantirishi, ikki kamera (orqadan / kapot), tutun, shina izlari, dvigatel ovozi.
- Eng yaxshi aylana vaqti va g'alabalar saqlanadi (`data/poyga-stats.json`; Render'ning bepul rejasida server qayta ishga tushganda tozalanadi).

## Boshqaruv

| Telefon | Kompyuter |
|---|---|
| Chap pastda **rul zonasi** (barmoqni chapga/o'ngga surish) | A D / ← → |
| **GAZ**, **TORMOZ** (to'xtaganda orqaga yuradi) | W / ↑, S / ↓ |
| **NITRO**, **DRIFT** | Shift, Space |
| sovg'a tugmasi, 📯 signal, 📷 kamera, ↩ qaytarish, ☰ menyu | E, H, C, R, Esc |

Sozlamalar (⚙): **Egish** — telefonni rul kabi egib boshqarish (sinov rejimi; yurmasa "Teskari" yoki "Nol" tugmasi), kamera, ovoz, grafika, server manzili.

## Poyga APK'sini yig'ish

```
cd apk-poyga
SERVER_URL=sariq-hovli.onrender.com ./build-apk.sh      # natija: ../dist/Poyga.apk
```

Server manzili APK ichiga yozilgan bo'ladi — do'stlar o'rnatib, ochishi bilan ulanadi. Yangilash: GitHub'ga `client` va `server`
papkalarini yuklash kifoya (Render o'zi qayta ishga tushadi), APK'ni qayta o'rnatish shart emas.

## Poygani sinash

```
node test/poyga-physics.mjs                                   # fizika, botlar, devorlar
PORT=3005 NO_ANIMALS=1 npm start &                            # server
URL=ws://localhost:3005/ws2 node test/poyga-server.mjs        # server: 3 odam + 2 bot, to'liq poyga
```
