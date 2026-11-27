# Lake — site e gestão

Recriação do site Lake 2025 (antes no Wix), com área de gestão própria em **/gestao**:
o cliente entra com **login e senha** e edita projetos, portfolio, textos, fotos e vídeos.
Logado, ele também vê o próprio site com um **lápis** em cada texto.

Roda num Worker da Cloudflare:

| Parte | Onde fica |
|---|---|
| Páginas (Home e Portfolio) | montadas na hora por `src/render.js`, a partir do conteúdo |
| Conteúdo e usuários | banco D1 `lake` (cada publicação vira uma versão; as 40 últimas ficam no histórico) |
| Fotos e vídeos | R2 `lake-midia`, servidos em `/media/...` |
| Gestão | `public/gestao/` (HTML + JS, sem dependências) |
| Lápis no site | `public/assets/js/editar.js`, carregado só para quem está logado |

Publicar = salvar: não há build. A mudança aparece no site na hora.

## Ligar na Cloudflare (uma vez)

1. **Ativar o R2** na conta: painel da Cloudflare → R2 → aceitar os termos (o plano grátis tem 10 GB).
2. **Criar o Worker a partir do GitHub**: Workers & Pages → Criar → Importar um repositório →
   `lontra`, ramo `cloudflare`. Comando de deploy: `npx wrangler deploy` (é o padrão).
   O primeiro deploy cria sozinho o banco D1 e o R2; as tabelas nascem no primeiro acesso.
3. **Cadastrar a senha do desenvolvedor**: no Worker → Configurações → Variáveis e segredos →
   Adicionar → tipo *Secret*, nome `SENHA_DESENVOLVEDOR`, valor = sua senha.
4. Abrir `https://<endereço do worker>/gestao/`, entrar com login `daniel` e a senha do passo 3.
5. Em **Acessos**, clicar em **Criar senha** para o cliente (login `lake`) e enviar a senha a ele.
6. Em **Fotos e vídeos**, clicar em **Copiar mídia do Wix para a Cloudflare** e esperar terminar.
7. (Opcional) Ligar o domínio próprio em Worker → Configurações → Domínios e rotas.

## Quem entra

| Login | Papel | Pode |
|---|---|---|
| `lake` | cliente | tudo do conteúdo, histórico, trocar a própria senha |
| `daniel` | desenvolvedor | o mesmo + criar/trocar a senha do cliente + migrar mídia do Wix |

Senhas guardadas só como hash (PBKDF2). Sessão em cookie assinado, `HttpOnly`, 7 dias; trocar a senha
derruba as sessões antigas. Depois de 8 tentativas erradas em 15 minutos, o login trava por 15 minutos.

## Rodar no computador

```bash
npm install
echo "SENHA_DESENVOLVEDOR=uma-senha-local" > .dev.vars
npm run dev        # http://localhost:8787  (gestão em /gestao/)
```

## Desktop e celular

O HTML e o CSS do desktop (980px ou mais) são os mesmos da versão estática; abaixo de 980px vale o layout
responsivo de `public/assets/css/style.css` (bloco "Celular e tablet").
