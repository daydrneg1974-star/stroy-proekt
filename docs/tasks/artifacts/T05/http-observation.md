# Наблюдение инфраструктуры до T05

22.11.2026 root выполнил HEAD к https://stroyengineering-demo-rifkat.daydrneg1974.chatgpt.site/ . Ответ: HTTP/2 200, Content-Type text/html, Cache-Control public,max-age=0,must-revalidate.

Set-Cookie: имя __cf_bm; значение исключено из протокола; HttpOnly; SameSite=None; Partitioned; Secure; Path=/; Domain=chatgpt.site; срок по Date/Expires — 30 минут.

В ответе HEAD не показаны CSP, HSTS, Referrer-Policy, Permissions-Policy. Это ограниченное наблюдение ответа, не исчерпывающий аудит безопасности платформы.

Повторный запрос HTML через Python urllib получил HTTP 403; содержимое HTML и его совпадение с исходником этим запросом не доказаны. Обход ограничений не предпринимался. Предыдущий опубликованный HTML был проверен обычным браузером при выпуске v6; новую версию root проверяет отдельно.
