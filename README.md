# Mirror Mayhem

Büyülü bir malikânenin balo salonunda aynalardan seken ışık büyüleriyle rakip illüzyoniste karşı oynanan tek oyunculu 2D arena prototipi.

## Çalıştırma

```bash
npm install
npm run dev
```

## Kontroller

- WASD veya ok tuşları: hareket
- Mouse: nişan ve büyü yolu ön izlemesi
- Space veya sol tık: ateş
- M: müziği ve efektleri aç/kapat
- F1: fizik debug görünümü

Her yeni düelloda mobilyalar ve aynalar yeniden konumlandırılır; iki rakip illüzyonist de tüy, ay ve yıldız armalarından farklı birini taşır. Gümüş aynalar ışığı standart biçimde yansıtır, kehribar aynalar yansıyan büyüyü üç kola ayırır, mor lanetli aynalar ise ışığın bittiği noktada alan patlaması oluşturur. Aynalar aynı zamanda hareketi engelleyen fiziksel nesnelerdir. Işık büyüleri arenada belirli bir hızla ilerler ve hareketli hedefe yalnızca temas ettiğinde hasar verir; bu nedenle gelen büyüden kaçılabilir.

## Görsel tasarım

- Karakterler: tüy, ay ve yıldız armaları taşıyan; asa yönü küçük ölçekte dahi okunan rakip illüzyonistler
- Engeller: büyü kitaplığı, capitonné kadife şezlong ve çalışan sarkaçlı büyükbaba saati
- Aynalar: gümüş yansıtıcı, kehribar prizmatik bölücü ve çatlak mor lanetli ayna
- Arena: simetrik balo salonu, baklava taş zemin, pirinç çerçeveler, kadife perdeler ve merkez madalyonu
- Seçilen konsept panosu: [`art/theme-concepts/02-enchanted-manor.png`](art/theme-concepts/02-enchanted-manor.png)

Oyunda kullanılan karakter ve engeller p5.js ile projeye özel olarak prosedürel çizilir. Üçüncü taraf sprite, oyun karakteri, marka, logo veya stok görsel kullanılmaz. Konsept panosu da bu proje için sıfırdan yapay zekâ ile oluşturulmuştur; çalışan oyun bu görsele çalışma zamanında bağımlı değildir.

## Ses ve lisans

Müzik ve efektler dışarıdan alınmış ses dosyaları kullanmaz. Tamamı Web Audio ile çalışma anında sentezlenen; klavsen benzeri oda müziği, cam harmonikleri, saat tıkırtıları, ahşap darbeler ve büyü vurgularından oluşan projeye özgü ses tasarımıdır. Üçüncü taraf sample veya müzik lisansı gerektirmez.

## Doğrulama

```bash
npm test
npm run build
```
