# Mirror Mayhem

Büyülü bir malikânenin balo salonunda aynalardan seken ışık büyüleriyle rakip illüzyoniste karşı oynanan tek oyunculu 2D arena prototipi.

## Çalıştırma

```bash
npm install
npm run dev
```

## Kontroller

- Kurulum ekranında ayna veya mobilyayı sol tuşla sürükleyerek yerleştirme
- Kurulum ekranında seçili aynayı Q / E ile döndürme
- Paneli Gizle: oyun alanının sol tarafına erişmek için kurulum panelini daraltma
- WASD veya ok tuşları: hareket
- Mouse: nişan ve büyü yolu ön izlemesi
- Space veya sol tık: ateş
- M: müziği ve efektleri aç/kapat
- F1: fizik debug görünümü

Kurulum ekranı otomatik bir arena taslağı üretir; mobilyalar ve aynalar düello başlamadan önce doğrudan oyun alanında elle taşınabilir, aynalar döndürülebilir. “Yerleşimi yenile” yeni bir otomatik taslak üretir. Varsayılan koridorlu labirent düzeni, balo salonunu üç şaşırtmalı geçide böler; kurulum ekranından daha açık veya kaotik düzenler de seçilebilir. İki rakip illüzyonist tüy, ay ve yıldız armalarından farklı birini taşır. Gümüş aynalar ışığı standart biçimde yansıtır, kehribar aynalar yansıyan büyüyü üç kola ayırır, mor lanetli aynalar ise ışığın bittiği noktada alan patlaması oluşturur. Aynalar aynı zamanda hareketi engelleyen fiziksel nesnelerdir. Işık büyüleri arenada belirli bir hızla ilerler ve hareketli hedefe yalnızca temas ettiğinde hasar verir; bu nedenle gelen büyüden kaçılabilir.

## Görsel tasarım

- Karakterler: tüy, ay ve yıldız armaları taşıyan; asa yönü küçük ölçekte dahi okunan rakip illüzyonistler
- Engeller: büyü kitaplığı, capitonné kadife şezlong ve çalışan sarkaçlı büyükbaba saati
- Aynalar: gümüş yansıtıcı, kehribar prizmatik bölücü ve çatlak mor lanetli ayna
- Arena: simetrik yerleşim, baklava taş zemin, pastel renk blokları ve ölçülü geometrik detaylar
- Seçilen konsept panosu: [`art/theme-concepts/02-enchanted-manor.png`](art/theme-concepts/02-enchanted-manor.png)

Oyunda kullanılan balo salonu, illüzyonistler, aynalar ve mobilyalar seçilen konsept panosundan türetilmiş projeye özel PNG varlıklarıdır ve `public/assets/manor` altında oyuna doğrudan yüklenir. Üçüncü taraf sprite, oyun karakteri, marka, logo veya stok görsel kullanılmaz. Işınlar, HUD ve hareketli efektler p5.js ile çalışma anında çizilir.

## Ses ve lisans

Müzik ve efektler dışarıdan alınmış ses dosyaları kullanmaz. Tamamı Web Audio ile çalışma anında sentezlenen; klavsen benzeri oda müziği, cam harmonikleri, saat tıkırtıları, ahşap darbeler ve büyü vurgularından oluşan projeye özgü ses tasarımıdır. Üçüncü taraf sample veya müzik lisansı gerektirmez.

## Doğrulama

```bash
npm test
npm run build
```
