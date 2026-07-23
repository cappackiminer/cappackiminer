# CappAckiMiner Yardım ve Kullanım Kılavuzu

Bu kılavuz CappAckiMiner’ın kurulumu, cüzdan bağlantısı, Main ve Lite görünümü, lisans yönetimi, yedekleme, ağ göstergeleri ve sorun giderme işlemlerini açıklar.

## 1. CappAckiMiner nedir?

CappAckiMiner, birden fazla Acki Nacki cüzdanını aynı masaüstü uygulamasından yönetmek için geliştirilmiş bir Windows uygulamasıdır. Uygulama ile:

- Kayıtlı cüzdanları tek ekranda görebilirsiniz.
- Cüzdan bakiyelerini ve son gelen ödülleri izleyebilirsiniz.
- Cüzdanları ayrı ayrı veya toplu olarak başlatıp durdurabilirsiniz.
- Main ve Lite görünümleri arasında geçiş yapabilirsiniz.
- Lisans kapsamındaki cüzdanları seçebilirsiniz.
- Cüzdan profillerini şifreli bir transfer dosyasıyla başka bilgisayara taşıyabilirsiniz.
- Uygulama, bağlantı ve ağ olaylarını Log panelinden takip edebilirsiniz.

CappAckiMiner bir cüzdan uygulaması değildir. Varlık gönderme, alma veya cüzdan bakiyesini harcama işlemleri AN Wallet üzerinden yapılır.

## 2. Sistem gereksinimleri

- 64 bit Windows 10 veya Windows 11
- Çalışan bir internet bağlantısı
- Güncel AN Wallet uygulaması
- Acki Nacki hesabı
- QR kodunu okutabilecek telefon veya uyumlu cihaz
- Kullanılacak cüzdan sayısına uygun CappAckiMiner lisansı

İşlemci sıcaklığı yalnızca Windows ve donanım uygun bir sıcaklık kaynağı sağlıyorsa gösterilir. Sıcaklığın boş görünmesi tek başına uygulama hatası değildir.

## 3. Kurulum

1. Yayınlanan CappAckiMiner kurulum dosyasını indirin.
2. Kurulum dosyasını çalıştırın.
3. Windows güvenlik uyarısı gösterirse dosyanın kaynağını ve yayınlanan sürümü kontrol edin.
4. Kurulum adımlarını tamamlayın.
5. CappAckiMiner’ı açın.
6. İlk hazırlık tamamlanana ve kayıtlı cüzdanların durumu görünene kadar bekleyin.

Yeni bir sürüme geçmeden önce önemli cüzdan profilleri için şifreli yedek oluşturmanız önerilir.

## 4. İlk açılış

Uygulama açıldığında:

- Yerel ayarlar yüklenir.
- Kayıtlı cüzdan profilleri geri getirilir.
- Aktif görünümün motoru hazırlanır.
- Lisans durumu kontrol edilir.
- Bakiye, ödül ve ağ verileri sırayla yenilenir.

Çok sayıda cüzdan varsa ilk hazırlık birkaç dakika sürebilir. Bu sırada kartlarda `STARTING`, `WAITING` veya seçilen dildeki karşılıkları görülebilir.

## 5. Main ve Lite görünümü

### Main

Main görünümü cüzdanları kart düzeninde gösterir. Her kartta cüzdan adı, durum, bakiye, son ödüller, sonuç sayaçları, ilerleme alanı ve cüzdan işlemleri bulunur.

Main görünümü ayrıntılı takip ve kart bazlı kullanım için uygundur.

### Lite

Lite görünümü daha yoğun bir tablo düzeni kullanır. Cüzdan adı, durum, bakiye, son ödül, sonuçlar ve işlemler daha az ekran alanında gösterilir. Arama ve durum filtresi Lite görünümünde kullanılabilir.

Lite görünümü özellikle çok sayıda cüzdanı aynı ekranda izlemek için uygundur.

### Görünüm değiştirirken

Main ve Lite birbirinden ayrı çalışma motorlarına sahiptir. Görünüm değiştirildiğinde eski görünümün motoru durdurulur ve seçilen görünüm hazırlanır. Aynı anda yalnızca aktif görünümün motoru çalışır. İki görünüm de aynı kayıtlı cüzdanları ve aynı lisans bilgisini kullanır.

Geçiş sırasında üst düğmede `SWITCHING` görünebilir. Hazırlık tamamlanmadan tekrar görünüm değiştirmeyin veya uygulamayı kapatmayın.

## 6. Üst göstergeler

### CPU

Bilgisayarın anlık işlemci kullanımını gösterir. Çok sayıda cüzdanın hazırlanması veya veri yenileme sırasında kısa süreli yükseliş normal olabilir.

### TEMP

İşlemci sıcaklığını gösterir. Değer yükselirse:

- Bilgisayarın hava kanallarını kontrol edin.
- Güç planını gözden geçirin.
- Animasyonları kapatın.
- Gerekmeyen diğer uygulamaları kapatın.
- Daha az cüzdanla çalışmayı deneyin.

### TPS

Acki Nacki ağından alınabilen güncel işlem yoğunluğu bilgisidir. Bu değer uygulamanın yerel hızını değil, ağın genel durumunu gösterir.

### STRESS

Son ağ istekleri ve bağlantı hataları kullanılarak hesaplanan ağ stresi göstergesidir:

- `LOW`: Yakın zamanda belirgin bir ağ sorunu görülmedi.
- `MEDIUM`: Geçici gecikmeler veya başarısız istekler var.
- `HIGH`: Ağ cevaplarında yoğun hata veya gecikme görülüyor.
- `UNKNOWN`: Sağlıklı bir değerlendirme için yeterli canlı veri yok.

STRESS göstergesi bir tahmindir. Tek başına ödül veya işlem sonucunu garanti etmez.

### Toplam ve günlük NACKL

Toplam NACKL, uygulamadaki cüzdanların erişilebilen bakiyelerinin toplamıdır. Günlük veya 24 saatlik değer, erişilebilen canlı ödül verilerinden hesaplanır. Ağ verisi gecikirse bu alanlar da geç yenilenebilir.

## 7. Cüzdan ekleme

1. `ADD WALLET / CÜZDAN EKLE` düğmesine basın.
2. AN Wallet hesap adını doğru biçimde yazın.
3. QR oluşturma düğmesine basın.
4. Ekrandaki QR kodunu AN Wallet ile okutun.
5. Telefonda görünen bağlantı ve yetkilendirme isteğini onaylayın.
6. Uygulamanın cüzdanı tanımasını ve kartı oluşturmasını bekleyin.

Onaydan sonra kartın görünmesi ağ yoğunluğuna göre biraz sürebilir. Aynı cüzdanı art arda tekrar eklemeye çalışmayın.

### QR ekranı açık kalırsa

- Telefonda onayın tamamlandığını kontrol edin.
- Doğru AN Wallet hesabını kullandığınızdan emin olun.
- Bilgisayar ve telefon internet bağlantısını kontrol edin.
- Birkaç dakika bekleyin.
- İşlem sonuçlanmazsa pencereyi kapatıp cüzdanı yeniden bağlamayı deneyin.

## 8. Cüzdan kartı ve satırı

Bir cüzdan kartında veya Lite satırında şu bilgiler bulunabilir:

- Cüzdan hesap adı
- Güncel çalışma durumu
- NACKL bakiyesi
- Son gelen ödül veya ödüller
- Kabul ve red sayaçları
- Başlatma ve durdurma düğmeleri
- QR ile yeniden bağlanma düğmesi
- Yerel profili kaldırma düğmesi

Ödül saati 24 saatlik biçimde gösterilir. Ödül alanı boşsa ağdan henüz yeni bir ödül bilgisi gelmemiş olabilir.

## 9. Bakiye sıralaması

`BALANCE / BAKİYE` düğmesi cüzdanları bakiyesi yüksek olandan düşük olana sıralar. Düğme etkin olduğunda yeni bakiye verileri geldikçe sıralama güncellenebilir.

Sıralamayı kapattığınızda cüzdanlar kayıtlı veya yerleştirilmiş düzenine döner. Bu düğmenin adı ve açıklaması seçilen uygulama diline göre değişir.

## 10. Cüzdan işlemleri

### Tümünü başlat

Lisans kapsamında seçilmiş ve bağlantısı hazır cüzdanları sırayla başlatır. Başlatma sırasında düğmeye tekrar tekrar basmayın.

### Tümünü durdur

Aktif işlemleri ve sıraya alınmış toplu başlatmaları durdurur.

### Tek cüzdanı başlat veya durdur

Kart ya da satır üzerindeki yeşil düğme yalnızca ilgili cüzdanı başlatır. Kırmızı düğme yalnızca ilgili cüzdanı durdurur.

### Yeniden bağlan

Dairesel ok düğmesi yeni bir QR bağlantı süreci açar. Aşağıdaki durumlarda kullanılabilir:

- Kartta `RESTORE FAILED` görünmesi
- Cüzdanın bağlantı anahtarının geçersiz olması
- Uygulamanın açıkça yeniden yetkilendirme istemesi
- Cüzdanın uzun süre hazırlanamayarak bağlantı hatası vermesi

Hazır veya bekliyor durumundaki her cüzdanın yeniden QR ile bağlanması gerekmez.

### Cüzdanı kaldır

Silme düğmesi yalnızca CappAckiMiner içindeki yerel cüzdan profilini kaldırır. Blockchain hesabını, AN Wallet hesabını veya bakiyeyi silmez.

## 11. Durumların anlamı

- `READY`: Cüzdan hazırlanmış ve başlatılabilir.
- `STARTING`: Cüzdanın yerel hazırlığı sürüyor.
- `RUNNING` veya `COMPUTING`: Cüzdan aktif çalışıyor.
- `WAITING`: Ağdan veya SDK’dan sonraki kesin sonuç bekleniyor.
- `RECOVERING`: Uygulama cüzdan bağlantısını güvenli şekilde yeniden hazırlıyor.
- `STOPPED`: Cüzdan kullanıcı tarafından veya toplu durdurmayla durduruldu.
- `FINISHED`: İlgili işlem tamamlandı.
- `NETWORK REJECTED`: Ağ işlemi kabul etmedi.
- `ERROR`: Bir bağlantı, SDK veya yerel işlem hatası oluştu.
- `RECOVERY FAILED` veya `RESTORE FAILED`: Kayıtlı bağlantı bilgisiyle cüzdan yeniden hazırlanamadı.

`WAITING` her zaman hata anlamına gelmez. Ancak cüzdanlar uzun süre aynı durumda kalırsa STRESS göstergesini ve Log panelini kontrol edin.

## 12. Lisans sistemi

Lisans bilgileri Main ve Lite görünümünde ortaktır. Görünüm değiştirmek yeni bir lisans gerektirmez.

Lisanslar:

- Belirli bir cüzdan kapasitesine sahip olabilir.
- Kullanım süresi sınırı içerebilir.
- Belirli bir cihaza bağlanabilir.
- Aynı anda kullanılabilecek cüzdanları sınırlandırabilir.

### Lisans etkinleştirme

1. `ADMIN` panelini açın.
2. Lisans anahtarını ilgili alana yapıştırın.
3. Etkinleştirme düğmesine basın.
4. Lisans durum kartındaki kapasite ve süre bilgisini kontrol edin.
5. Gerekirse çalışacak cüzdanları seçin.

Lisans anahtarı cihaz koduyla eşleşmiyorsa etkinleştirme başarısız olabilir.

### Ücretsiz kullanım

Ücretsiz veya bağış modeliyle sunulan kapasite uygulama içindeki lisans durumunda gösterilir. Güncel paket bilgisi için uygulamadaki lisans paketleri bölümünü kontrol edin.

## 13. Cüzdan yedeği ve bilgisayarlar arası taşıma

### Yedek oluşturma

1. `ADMIN` panelini açın.
2. Cüzdan yedeği transfer aracını seçin.
3. Güçlü ve unutmayacağınız bir parola belirleyin.
4. Oluşturulan transfer dosyasını güvenli bir konumda saklayın.

Yedek parolası uygulama tarafından geri getirilemez. Parolayı kaybederseniz şifreli yedek açılamaz.

### Yedeği başka bilgisayara aktarma

1. Hedef bilgisayara CappAckiMiner’ı kurun.
2. Transfer dosyasını hedef bilgisayarda çalıştırın.
3. İstendiğinde yedek parolasını girin.
4. Uygulamanın profilleri içe aktarmasını bekleyin.
5. Kartların durumunu kontrol edin.
6. Yeniden bağlantı isteyen cüzdanları QR ile onaylayın.

Transfer dosyasını, parolayı veya cüzdan bağlantı verilerini herkese açık kanallarda paylaşmayın.

## 14. Dil, tema ve görünüm ayarları

Logo menüsünden aşağıdaki diller seçilebilir:

- Türkçe
- English
- Русский
- العربية
- 简体中文
- Bahasa Indonesia

Dil seçimi kaydedilir ve uygulama yeniden açıldığında korunur. Arayüz şekli, tema ve animasyon ayarları da aynı menüden değiştirilebilir.

Animasyonları kapatmak görsel efektleri azaltır. Cüzdan bakiyeleri, lisans kontrolleri ve ağ verileri çalışmaya devam eder.

## 15. Log paneli

Log paneli uygulamanın bağlantı, cüzdan, SDK, kurtarma ve ağ olaylarını saat bilgisiyle gösterir.

Kullanılabilen işlemler:

- Logu dosyaya kaydetme
- Log klasörünü açma
- Ekrandaki log kayıtlarını temizleme

Logu temizlemek cüzdan profillerini veya bakiyeleri silmez.

Sorun bildirirken mümkünse şu bilgileri birlikte gönderin:

- Uygulama sürümü
- Windows sürümü
- Sorunun görüldüğü saat
- Etkilenen cüzdanın adı
- Kartta görünen durum
- İlgili Log satırları
- STRESS ve TPS göstergeleri

QR içeriğini, özel anahtarları, yedek parolasını veya tam lisans anahtarını paylaşmayın.

## 16. Sık karşılaşılan sorunlar

### Cüzdanların çoğu WAITING durumunda

1. STRESS göstergesini kontrol edin.
2. TPS değerinin güncellenip güncellenmediğine bakın.
3. Log panelinde ağ veya SDK hatalarını kontrol edin.
4. Birkaç dakika otomatik yeniden denemeyi bekleyin.
5. Sorun bütün cüzdanlarda aynı anda başladıysa ağ kaynaklı olma ihtimali yüksektir.
6. Uzun süre düzelmezse `STOP ALL` ile durdurup uygulamayı yeniden açın.

Her cüzdanı aynı anda QR ile yeniden bağlamak ilk seçenek olmamalıdır.

### RESTORE FAILED görünüyor

1. İlgili cüzdanın yeniden bağlan düğmesine basın.
2. QR kodunu doğru AN Wallet hesabıyla okutun.
3. Onayı tamamlayın.
4. Kartın tekrar hazırlanmasını bekleyin.

Sorun yalnızca bir veya birkaç cüzdandaysa önce yalnızca o cüzdanları yeniden bağlayın.

### Cüzdan eklendi ancak kart geç geliyor

Onay sonrası ağ doğrulaması zaman alabilir. İnternet bağlantısı çalışıyorsa en az birkaç dakika bekleyin. Aynı hesabı tekrar tekrar eklemeyin.

### Bakiye veya ödül güncellenmiyor

- Ağ göstergelerini kontrol edin.
- Log panelinde veri sorgusu hatası olup olmadığına bakın.
- Cüzdan adının doğru olduğunu kontrol edin.
- Bir sonraki otomatik veri yenilemesini bekleyin.
- Gerekirse uygulamayı yeniden açın.

### Start All etkin olmuyor

- Lisansın aktif olduğunu kontrol edin.
- Lisans kapsamında cüzdan seçildiğini kontrol edin.
- Görünüm geçişinin tamamlanmasını bekleyin.
- Cüzdanların hazırlanmış olduğundan emin olun.
- Açık bir QR onay penceresi varsa işlemi tamamlayın veya kapatın.

### CPU veya sıcaklık yüksek

- Animasyonları kapatın.
- Gereksiz uygulamaları kapatın.
- Bilgisayarın soğutmasını kontrol edin.
- Daha az cüzdanla karşılaştırma yapın.
- Windows güç planını kontrol edin.

### Uygulama açılmıyor

- Windows güvenlik bildirimlerini kontrol edin.
- Kurulum dosyasının eksiksiz indiğinden emin olun.
- Bilgisayarı yeniden başlatın.
- Uygulamayı yeniden kurun.
- Sorun devam ederse Log klasöründeki son dosyayı destek ekibine gönderin.

## 17. Güvenlik

- Cüzdan özel anahtarlarını paylaşmayın.
- QR kodunun veya bağlantının ekran görüntüsünü herkese açık paylaşmayın.
- Yedek parolasını transfer dosyasıyla aynı yerde saklamayın.
- Lisans üretiminde kullanılan özel geliştirici dosyalarını dağıtmayın.
- Yalnızca güvendiğiniz kurulum dosyalarını çalıştırın.
- Cüzdan adını ve hassas bilgileri sorun raporlarında gerektiği kadar maskeleyin.

## 18. Kapatma ve sistem tepsisi

Pencereyi sistem tepsisine gizlemek uygulamayı tamamen kapatmayabilir. Aktif çalışmayı sonlandırmak istiyorsanız önce `STOP ALL` düğmesini kullanın, ardından uygulamayı tamamen kapatın.

Uygulamayı güncellemeden, kaldırmadan veya bilgisayarı kapatmadan önce aktif cüzdanları durdurmanız önerilir.
