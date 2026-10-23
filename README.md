# SARIQ HOVLI

5 kishilik onlayn 3D otishma o'yini. Har kim o'zi uchun, telefon yoki kompyuterdan, internet orqali.

O'yinchilar: **Tohir, Abdulatif, Asror, Muhammad, Sunnatulloh**. Har bir o'yinchining ismi peshona bog'ichida
(oldida va orqasida) hamda orqa yelkasida yozilgan, rangi ham har xil.

## Nima bor

- **Xarita:** sariq tuproqli maydon, bir-biriga qarab turgan 2 ta parallel 3 qavatli bino, o'rtada hovli va hovlida 4 ta yashik.
  Har qavat bitta katta zal, ko'p derazali. Ichkarida zinalar (yerdan 1-qavatga g'arbda, 1-dan 2-qavatga sharqda).
  Xarita o'zimiznikidir va Tundra xaritasining ruhiga yaqin qilib chizilgan; undan nusxa ko'chirilmagan.
- **3 xil qurol:** Pistolet (aniq), Avtomat (tez, avtomatik), Snayper (zoom, 1 ta o'q kuchli). Boshni urish 2 barobar zarar.
- **Qoidalar:** har kim o'zi uchun. 20 ta o'ldirgan yutadi yoki 5 daqiqadan keyin eng ko'p o'ldirgan yutadi.
  Raund tugagach natijalar chiqadi va 12 soniyadan keyin yangi raund boshlanadi.
  O'lgan 3 soniyadan keyin qayta tug'iladi (2,5 soniya himoya bilan).
- **Qo'shimchalar:** 6 ta dori qutisi (+50 HP, 25 soniyada qayta paydo bo'ladi), o'ldirishlar lentasi, urilish belgisi,
  zarar yo'nalishi, tovushlar, ping/FPS ko'rsatkichi, sezgirlik va grafika sifati sozlamalari.

## Boshqaruv

| Telefon | Kompyuter |
|---|---|
| Chap tomonda barmoqni surish: yurish (joystik) | `W A S D` |
| O'ng tomonni surish: qarash | sichqoncha |
| Qizil **OTISH** tugmasi (bosib turib ham qarash mumkin) | chap tugma |
| **SAKRA**, **ZARYAD**, **ZOOM** (snayperda) | `Space`, `R`, o'ng tugma |
| Pastdagi 1-2-3 qutilari: qurol almashtirish | `1` `2` `3` yoki g'ildirak |
| ☰ tugmasi: pauza | `Esc` |

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
```

## Sozlash

- `client/shared/consts.js` — qurollar (zarar, tezlik, o'q soni), HP, raund vaqti, g'alaba uchun o'ldirish soni, ismlar va ranglar.
- `client/shared/map.js` — xarita. Bino o'lchamlari, derazalar, yashiklar, tug'ilish nuqtalari shu yerda.
- `server/server.js` — server. `PORT` muhit o'zgaruvchisi bilan port tanlanadi.

## Muammolar

| Muammo | Yechim |
|---|---|
| "Serverga ulanmoqda…" turib qoladi | Render serveri uxlagan bo'lishi mumkin, 1 daqiqa kuting. Manzil to'g'riligini tekshiring |
| "Ismi band" | Shu ismni boshqa kishi tanlagan yoki avvalgi ulanish hali uzilmagan; 5 soniyadan keyin qayta urining |
| Kechikish (ping baland) | Chap yuqori burchakda ping ko'rinadi. Wi-Fi yoki yaqinroq server (Render'da Frankfurt) yordam beradi |
| Telefon sekin ishlayapti | ☰ → Sifat: "Past" |

## Eslatmalar

- Server har bir o'yinchining joyini o'yinchining o'zidan oladi (do'stlar o'rtasida o'ynash uchun yetarli), o'q tegishi, zarar, hisob esa
  serverda hisoblanadi.
- O'yin faqat 5 ta belgilangan ism uchun mo'ljallangan.
