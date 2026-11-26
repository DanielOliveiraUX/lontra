# The Mood Swinger — site

Site estático (Jekyll, publicado pelo GitHub Pages) recriado a partir do Wix Studio.

- Site: https://danieloliveiraux.github.io/lontra/
- Painel de gestão: https://danieloliveiraux.github.io/lontra/admin/ (Pages CMS)

## O que é editável pelo painel

- **Projetos (página WORK):** adicionar, remover, reordenar, trocar título e foto.
  As posições da galeria seguem um padrão fixo de 18 lugares que se repete.
- **Textos e fotos do site:** abertura, colagem "Latest Projects" (8 fotos),
  About, Creative Services, Instagram (4 fotos) e rodapé.

Cada alteração salva no painel vira um commit no repositório; o site é atualizado em ~1 minuto.

## Estrutura

```
_data/site.yml          Textos e fotos da página inicial e do rodapé
_data/projects.yml      Projetos da página WORK
_data/layout.json       Posições e animações (não editar pelo painel)
_layouts/, _includes/   Modelos das páginas
index.html              Página inicial
projects/index.html     WORK
assets/                 CSS, JS e imagens (uploads do painel em assets/uploads/)
.pages.yml              Configuração do painel (Pages CMS)
admin/index.html        Atalho /admin/ para o painel
```

## Rodar localmente

```
bundle exec jekyll serve --baseurl /lontra
```
