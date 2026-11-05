# Jeden bot Spiżarni dla zespołu

Zespół dostaje jednego współdzielonego bota Spiżarnia. Właściciel wpisuje instrukcję raz w opisie bota i zapisuje cztery skille. Członek zespołu dodaje bota z listy i pisze do niego zwykłą wiadomością. Nie dostaje promptu do wklejenia.

Opis dotyczy kodu w commicie `3d0ca33` oraz dokumentacji Grok Bota odczytanej 5 listopada 2026.

## Stan

Mamy:

1. [Spiżarnia](../README.md) trzyma jedną lodówkę, zapisane propozycje posiłków i listę zakupów. Dostęp do nich daje jeden `HOUSEHOLD_TOKEN`.
2. Bot czyta i zapisuje te dane przez MCP na `/mcp`. Lista narzędzi jest w [README](../README.md#remote-mcp).
3. Dieta, gazetka, zdjęcie półki i koszyk we Frisco nie są funkcjami aplikacji. Wykonuje je bot, a wynik zapisuje narzędziami Spiżarni.
4. [Współdzielony bot](https://docs.x.ai/grok-bot/shared-bots) ma opis w **About**. Właściciel albo Manager edytuje go raz. Ta instrukcja obowiązuje w każdym prywatnym czacie z tym botem.

Dalsze kroki:

1. Właściciel tworzy bota w chmurze, wkleja opis z tej analizy i zapisuje cztery skille.
2. Po `bun run deploy` dopisuje sekret `HOUSEHOLD_TOKEN` i serwer MCP pod adresem, który wypisze Void.
3. Udostępnia bota zespołowi jako Collaborator i włącza Auto-add.
4. Osobne gospodarstwa wymagają zmiany aplikacji. Drugi opis bota nie rozdzieli danych.

## Aplikacja trzyma dane, bot podejmuje decyzje

[README](../README.md) mówi wprost, że strona nie generuje posiłków i nie woła modelu. [Promocje i ceny sklepów nie są zaimplementowane](../README.md#bot-roles).

Bot ma do dyspozycji narzędzia z [src/mcp.ts](../src/mcp.ts): odczyt i zapis lodówki, zapis propozycji posiłku oraz odczyt i zapis listy zakupów. Data ważności to dzień `YYYY-MM-DD` w strefie Europe/Warsaw.

| Potrzeba | Kto to robi | Gdzie ląduje wynik |
| --- | --- | --- |
| Zdjęcie szafki albo lodówki | Bot ogląda załącznik w czacie | Spiżarnia, po potwierdzeniu listy przez człowieka |
| Sprawdzenie diety i propozycja posiłku | Bot, na podstawie ustaleń z rozmowy | `save_meal_suggestion` |
| Gazetka albo strona promocji | Bot czyta zdjęcie, plik albo otwartą stronę | Lista dla zakupów. Cena bez źródła nie wchodzi do wyniku |
| Wybór zakupów | Bot porównuje braki w lodówce z cenami, które dostał | `add_shopping_item` |
| Koszyk we Frisco | Bot w przeglądarce, na sesji osoby, dla której pracuje | Zatrzymanie przed płatnością. Aplikacja nie składa zamówienia |

Cena, promocja i dostępność produktu istnieją tylko wtedy, gdy są w narzędziu Spiżarni, na załączniku albo na otwartej stronie.

## Udostępnienie bez wklejania promptu

### Bot współdzielony

To właściwy sposób na usługę dla zespołu. [Bot osobisty nie ma pola opisu](https://docs.x.ai/grok-bot/bots#edit-a-bot). [Bot współdzielony ma opis](https://docs.x.ai/grok-bot/shared-bots#how-do-i-edit-or-delete-a-shared-bot), a skille, sekrety, aplikacje i pliki właściciela działają u każdej osoby, która z niego korzysta.

1. [Utworzyć bota w chmurze](https://docs.x.ai/grok-bot/shared-bots#how-do-i-create-a-bot-for-my-team). Bot uruchomiony na własnym komputerze nie podlega udostępnieniu.
2. Wkleić instrukcję z tej analizy w opis **About**.
3. Zapisać cztery skille. [Skill opisuje sposób wykonania zadania](https://docs.x.ai/grok-bot/skills-routines-and-automations) i jest przypisany do bota, więc osoba z zespołu nie powtarza procedury w wiadomości.
4. Dodać serwer MCP spoza katalogu, pod adresem `https://<host>/mcp`, z nagłówkiem `Authorization`. [Bot działa na komputerze w chmurze](https://docs.x.ai/grok-bot/computer-and-apps) i z tego komputera musi dosięgnąć adresu. Host wypisuje `void deploy`. W repozytorium jest tylko nazwa workera `grokbot-hackathon-wroclaw` w [void.lock.json](../void.lock.json).
5. Token wpisać na karcie sekretu, nie w opisie i nie w czacie. [Do bota współdzielonego wolno dodać tylko taki klucz, który mogą wykorzystać wszyscy zaproszeni](https://docs.x.ai/grok-bot/shared-bots#how-do-i-create-a-bot-for-my-team).
6. [Share](https://docs.x.ai/grok-bot/shared-bots#how-do-i-share-a-bot-with-my-team): cały zespół albo wybrane osoby. Collaborator rozmawia. Manager może zmieniać opis, skille, pamięć i aplikacje.
7. W panelu Cursor, na stronie Grok Bot, [Auto-add](https://docs.x.ai/grok-bot/teams-and-enterprises) wstawia bota do paska. Pozostali wchodzą przez `+` i [Browse shared Bots](https://docs.x.ai/grok-bot/shared-bots#how-do-teammates-find-a-shared-bot).

[Czat każdej osoby jest prywatny](https://docs.x.ai/grok-bot/shared-bots#can-the-owner-see-my-chats-with-a-shared-bot). Właściciel nie czyta tych rozmów. [Odpowiedź liczy się z limitu osoby, która pyta](https://docs.x.ai/grok-bot/shared-bots#whose-usage-pays-for-a-shared-bot-chat). [W prywatnym czacie bot zwykle pracuje na komputerze Groka tej osoby](https://docs.x.ai/grok-bot/shared-bots#which-computer-does-a-shared-bot-use), więc sesja Frisco należy do niej, a nie do właściciela bota. Zatwierdzenie ryzykownej czynności też wraca do osoby, która pyta.

[Bot współdzielony nie może być czyimś botem głównym](https://docs.x.ai/grok-bot/bots#your-primary-bot).

### Szablon

[Szablon](https://docs.x.ai/grok-bot/bots#share-a-bot) daje każdej osobie własną kopię z opisem, skillami i rutynami. Też nie wymaga wklejania promptu. Kopia nie dostaje komputera, sesji ani sekretów właściciela. Poprawka opisu u właściciela aktualizuje opublikowany szablon. Nie wchodzi sama do kopii, które ktoś już dodał. [Link publiczny pokazuje konfigurację bota](https://docs.x.ai/grok-bot/bots#share-a-bot), więc przed publikacją usuwa się z niej adres wewnętrzny i token.

Szablon nadaje się dla osoby spoza zespołu, która ma własną Spiżarnię i własny token. Nie jest usługą, którą zespół utrzymuje po wdrożeniu.

## Odrzucone warianty

| Wariant | Dlaczego nie jako usługa zespołu |
| --- | --- |
| Pięć botów i prompt wklejany przez każdą osobę | [Bot osobisty nie ma opisu](https://docs.x.ai/grok-bot/bots#edit-a-bot). Każdy powtarza ten sam tekst, a [grupa mieści od 2 do 6 botów](https://docs.x.ai/grok-bot/chat-and-collaboration#start-a-group-chat). |
| Pięć współdzielonych botów specjalistów | Każda osoba i tak składa grupę. [Ze Slacka współdzielony bot przekazuje pracę do botów tej osoby](https://docs.x.ai/grok-bot/shared-bots#how-do-i-add-a-shared-bot-to-slack), a nie do pozostałych specjalistów właściciela. |
| Sam szablon dla zespołu | Każdy dostaje osobną kopię bez wspólnego sekretu Spiżarni i bez późniejszej poprawki instrukcji. |

Widoczne przekazanie między rolami zostaje możliwe: właściciel udostępnia kilka botów, a osoba dodaje je do jednej grupy. To układ do oglądania podziału pracy, nie do uruchomienia usługi.

## Jedno gospodarstwo

[Jeden token otwiera wszystkie dane gospodarstwa](../README.md). Sekret współdzielonego bota jest dostępny w czacie każdej zaproszonej osoby, więc cały zespół pracuje na tej samej lodówce i tej samej liście zakupów. Osobne gospodarstwo to osobny token i osobna baza, a nie osobny opis bota.

## Instrukcja właściciela

Poniższy opis trafia do **About** raz. Skille zapisuje właściciel na tym samym bocie.

### Opis

```text
Jesteś botem Spiżarni dla jednego gospodarstwa w Polsce. Rozmawiasz z osobą po polsku i sam wykonujesz cztery zadania: odczyt półki, sprawdzenie diety, odczyt gazetki, ułożenie zakupów. Nie prosisz jej o wklejenie instrukcji.

Najpierw odczytaj list_inventory, list_meal_suggestions i list_shopping_items. Nie wymyślaj stanu lodówki, ceny, promocji ani dostępności. Cena może pochodzić tylko z narzędzia, załącznika albo otwartej strony.

Ze zdjęcia szafki lub lodówki wypisz tylko to, co widać. Nieczytelną etykietę oznacz jako niepewną i nie zapisuj jej. Zapis add_inventory_item albo update_inventory_item rób po potwierdzeniu listy. consume_inventory_item tylko wtedy, gdy osoba powie, że produkt został zużyty. expiresOn to data YYYY-MM-DD w strefie Europe/Warsaw.

Dietę bierz z rozmowy. Gdy brakuje celu, wykluczenia albo liczby osób, zapytaj o jedną brakującą rzecz. Propozycję posiłku zapisz przez save_meal_suggestion.

Z gazetki zwróć produkt, cenę, sklep, okres obowiązywania i wskazanie źródła. Pomiń pozycję bez ceny.

Braki dopisz przez add_shopping_item. update_shopping_item jako kupione tylko wtedy, gdy osoba powie, że towar jest w domu. We Frisco złóż koszyk na istniejącej sesji i zatrzymaj się przed płatnością. Pokaż listę i sumę ze strony.

Odpowiedź: co jest w domu, czego brakuje, proponowany posiłek, co kupić, koszt według źródła, co wymaga zgody.
```

### Skille

Każdy skill ma te same granice co opis. Różni się tym, kiedy bot go używa.

| Skill | Kiedy | Wynik |
| --- | --- | --- |
| Półka | Osoba przysyła zdjęcie szafki albo lodówki | Lista widocznych produktów i zapis do Spiżarni po potwierdzeniu |
| Dieta | Osoba pyta, czy posiłek albo dzień pasuje do ustaleń | Ocena kolizji z wykluczeniem i `save_meal_suggestion` |
| Gazetka | Osoba przysyła gazetkę, plik albo adres promocji | Tabela cen ze źródłem, bez zapisu do Spiżarni |
| Zakupy | Osoba prosi o listę albo koszyk | Pozycje w Spiżarni, a we Frisco koszyk zatrzymany przed płatnością |

## Granice, których opis nie pilnuje

Opis nie izoluje danych. [Boty jednego konta współdzielą komputer, pliki i sesje przeglądarki](https://docs.x.ai/grok-bot/computer-and-apps#one-computer-shared-by-all-your-bots). Osobna nazwa bota nie oddziela Frisco ani Spiżarni od innych botów tej samej osoby.

[Płatność i inne ryzykowne kroki przechodzą przez zatwierdzenie osoby, która pyta](https://docs.x.ai/grok-bot/shared-bots#how-do-approvals-work-on-a-shared-bot). To jest granica operacji, nie osobna baza gospodarstwa.
