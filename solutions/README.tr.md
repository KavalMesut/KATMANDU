[English](README.md)

# KATMANDU çözüm arşivi

KATMANDU yerel sunucuyla çalışırken tamamlanan her çözümü bu klasöre ayrı bir
JSON dosyası olarak kaydeder. Dosyalar uygulamanın **Kütüphanem** paneli
tarafından otomatik okunur ve güncellenir.

Bu klasördeki `.json` dosyaları kişisel çalışma verisidir ve Git tarafından
izlenmez. Bir çözümü silmeden veya dosya adını değiştirmeden önce uygulamayı
kapatmanız önerilir.

Arşiv yolu `solutions/` klasörüdür. Eski `cozumler/` JSON dosyaları ilk yerel
arşiv işleminde buraya taşınır. Çakışan eski kayıtlar mevcut dosyanın üzerine
yazılmadan ve kimlikleri değiştirilmeden `legacy-cozumler/` altında korunur.
Yedekler kütüphane listesine ve Git’e dahil edilmez.
