# The Mood Swinger — site estático

Recriação do site feito no Wix Studio em HTML, CSS e JavaScript puros, sem dependências nem etapa de build.

## Estrutura

```
index.html                      Página inicial
projects/index.html             WORK (galeria horizontal)
privacy-policy/index.html       Privacy Policy
accessibility-statement/        Accessibility Statement
assets/css/style.css            Estilos (desktop > 1000px, tablet 751–1000px, mobile ≤ 750px)
assets/js/main.js               Menu mobile, galeria e animações de rolagem/mouse
assets/img/                     Imagens locais
```

## Publicar no GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)`.

## Ver localmente

```
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Observações

- As fotos da colagem, da galeria e do Instagram ainda são carregadas do CDN do Wix (`static.wixstatic.com`).
  Para tirar essa dependência, baixe cada imagem para `assets/img/` e troque a URL no HTML.
- Fontes: "Bodoni Moda" itálico (Google Fonts) no lugar da Didot do Wix e Helvetica/Arial do sistema.
