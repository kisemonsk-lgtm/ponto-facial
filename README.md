# Ponto Facial — o app do tablet

> **No ar:** https://kisemonsk-lgtm.github.io/ponto-facial/ — abra no Chrome do tablet e
> toque em **⬇ Instalar** (ou menu ⋮ → “Adicionar à tela inicial”). A câmera só funciona em
> https, e esse endereço já é https.

App de **registro de ponto por reconhecimento facial** para o tablet da obra, feito
sobre a logo da CAS. É um site instalável (PWA): abre no navegador, pode ser
“instalado” na tela inicial e **funciona sem internet** depois do primeiro acesso.

## Como funciona

1. **Modo câmera (o padrão):** a tela fica com a câmera aberta e uma moldura para o rosto.
   Quando alguém é reconhecido, aparece a foto e o nome, com o botão
   **“✅ Confirmar Entrada / Saída”**. A confirmação evita que alguém bata o ponto do outro.
2. **PIN:** quem não for reconhecido (luz ruim, barba, óculos) digita um PIN de 4 números.
3. **Painel do RH (menu ☰):**
   - **Rostos** — cadastrar/refazer o rosto de cada funcionário (3 fotos: frente, esquerda, direita), definir PIN, apagar rosto;
   - **Batidas do dia** — tudo o que foi batido, com hora, tipo, como foi reconhecido e a confiança;
   - **Ajustes** — nome da empresa, semelhança mínima, motor de reconhecimento, backup e importação.

## Folha de ponto do funcionário

A cada batida o app **abre a folha de ponto daquela pessoa, já atualizada** (dia ou mês),
com previsto × trabalhado, extras 50%/100%, atrasos, saldo, “falta bater a saída” e os campos
de assinatura — dá para **imprimir ou salvar em PDF** na hora. O botão **📋 Minha folha**
no topo abre a mesma folha quando quiser.

## Fotos do rosto

- No **cadastro do RH** ficam salvas **3 fotos** do funcionário (frente, esquerda, direita) —
  é o rosto oficial dele no sistema.
- Na **batida**, nenhuma foto é tirada nem guardada: a comparação é feita na hora, na memória,
  e a batida registra só a hora e a nota de semelhança. As imagens da câmera não são armazenadas.
- A exportação para o Ponto Livre leva apenas nomes e horários — nunca as fotos.

## Ligação com o Ponto Livre

- **Trazer os funcionários:** no Ponto Livre → Funcionários → *Baixar lista (.json)*, depois aqui em
  **Ajustes → Importar funcionários**. Também aceita o backup completo do Ponto Livre.
- **Levar as batidas:** aqui em **Batidas do dia → Exportar para o Ponto Livre**. O arquivo já sai no
  formato que o Ponto Livre entende (data + as 4 batidas de cada pessoa), pronto para lançar na folha.

## Reconhecimento facial (sem nuvem, sem custo)

- **Modo rápido (padrão):** compara cor, textura e formato do rosto — instantâneo, funciona em qualquer tablet.
- **Modo IA:** usa o modelo *FaceNet* (face-api.js) — bem mais preciso. Baixa ~2 MB **uma única vez**
  (precisa de internet) e depois roda offline. Em tablet antigo fica mais lento.
- Nada sai do aparelho: as fotos e as batidas ficam no próprio navegador do tablet.

## Como instalar no tablet

1. O app precisa estar num endereço **https** (ou no próprio tablet via localhost) para a câmera funcionar —
   o navegador só libera a câmera em conexão segura. Para publicar, qualquer hospedagem de site estático
   serve (GitHub Pages, Netlify, Vercel, Cloudflare Pages) — é só subir esta pasta.
2. Abra o endereço no **Chrome** do tablet → menu **⋮** → **“Adicionar à tela inicial”**
   (ou toque no botão **⬇ Instalar** que aparece no topo do app).
3. Abra pelo ícone do **Ponto Facial**: ele roda em tela cheia e sem internet.

## Arquivos

```
index.html                 telas (câmera, painel do RH, modais)
css/estilo.css             visual nas cores da CAS
js/facial.js               captura e comparação de rostos (modo rápido e modo IA)
js/app.js                  batidas, PIN, cadastro de rostos, exportação
sw.js                      cache para funcionar offline
manifest.webmanifest       nome, ícones e instalação
logo-cas-facial.png        logo CAS adaptada (fundo claro)
logo-cas-facial-branco.png logo CAS adaptada em branco (fundo escuro)
icone-*.png                ícones do app
icones/gerar-logo.py       script que gerou a logo e os ícones a partir da logo original
icones/originais/          a logo original da CAS, guardada para referência
```

## O que mudou na logo da CAS

Mesma letra, mesma ideia: as letras continuam vermelhas, num **carmim um pouco mais profundo**,
e abaixo entra uma tarja carmim com **“PONTO FACIAL”** no lugar de “Construtora de armazéns e silos”.
O ícone do app usa as letras em branco sobre o carmim, com a moldura de reconhecimento facial nos cantos.
