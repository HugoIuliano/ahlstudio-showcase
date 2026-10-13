import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { PRIVACY_VERSION } from "@/lib/security";
import { LegalLayout, legalParty } from "@/components/store/legal";

export const metadata = { title: "Política de Privacidade" };

export default async function PrivacyPage() {
  const s = await getSettings();
  const p = legalParty(s);
  return (
    <LegalLayout title="Política de Privacidade e Proteção de Dados" version={PRIVACY_VERSION}>
      <p>
        Esta Política explica como <strong>{p.name}</strong> ("{p.brand}", "nós"), CNPJ/CPF <strong>{p.doc}</strong>, {p.address}, trata os dados pessoais de quem visita o site, cria conta, solicita orçamentos, compra ou abre chamados, em conformidade com a{" "}
        <strong>Lei Geral de Proteção de Dados Pessoais — LGPD (Lei 13.709/2018)</strong>, o Marco Civil da Internet (Lei 12.965/2014) e o Código de Defesa do Consumidor, e alinhada às boas práticas das normas <strong>ISO/IEC 27001</strong> (segurança da informação), <strong>ISO/IEC 27701</strong> (privacidade) e <strong>ISO/IEC 29100</strong> (princípios de privacidade).
      </p>

      <h2>1. Controlador e Encarregado (DPO)</h2>
      <p>
        <strong>Controlador:</strong> {p.name}. <strong>Encarregado pelo tratamento de dados (art. 41 da LGPD):</strong> contato pelo e-mail <strong>{p.dpo}</strong>. É a esse canal que você deve se dirigir para dúvidas, reclamações e exercício de direitos.
      </p>

      <h2>2. Princípios que seguimos</h2>
      <p>Finalidade, adequação, necessidade (minimização), livre acesso, qualidade dos dados, transparência, segurança, prevenção, não discriminação e responsabilização/prestação de contas (art. 6º da LGPD). Coletamos apenas o estritamente necessário para cada finalidade e registramos as bases legais e consentimentos.</p>

      <h2>3. Quais dados coletamos, para quê e com que base legal</h2>
      <div className="scroll-x">
        <table>
          <thead><tr><th>Dados</th><th>Quando</th><th>Finalidade</th><th>Base legal (art. 7º)</th></tr></thead>
          <tbody>
            <tr><td>Nome, e-mail, telefone/WhatsApp, senha (armazenada apenas como hash)</td><td>Cadastro, checkout, orçamento, chamado</td><td>Criar e autenticar sua conta, identificar o pedido, comunicar status</td><td>Execução de contrato (V); consentimento para conta (I)</td></tr>
            <tr><td>Endereço de entrega, CPF/CNPJ quando exigido para nota fiscal</td><td>Checkout com entrega</td><td>Entregar o pedido, emitir documentos fiscais</td><td>Execução de contrato (V); obrigação legal (II)</td></tr>
            <tr><td>Dados de pagamento</td><td>Checkout</td><td>Processar o pagamento — feito pelo Mercado Pago; não recebemos nem armazenamos número de cartão, apenas identificador e status da transação</td><td>Execução de contrato (V)</td></tr>
            <tr><td>Conteúdo de orçamentos e chamados, arquivos e referências enviados</td><td>Personalizados, Central de Ajuda</td><td>Analisar viabilidade, produzir sua peça, prestar atendimento</td><td>Execução de contrato (V); procedimentos preliminares (V)</td></tr>
            <tr><td>Endereço IP, navegador (user-agent), data/hora, páginas acessadas, eventos de conta (login, alterações)</td><td>Navegação e uso</td><td>Segurança, prevenção a fraudes, registro de aceites e auditoria (Marco Civil, art. 15)</td><td>Legítimo interesse (IX); obrigação legal (II)</td></tr>
            <tr><td>Registro de consentimento (tipo, versão, IP, e-mail, data/hora)</td><td>Aceite de termos/política e cookies</td><td>Comprovar o consentimento (art. 8º, §2º)</td><td>Obrigação legal / prestação de contas</td></tr>
            <tr><td>Nome, e-mail e foto da conta Google</td><td>Login com Google</td><td>Autenticar sem senha</td><td>Consentimento (I)</td></tr>
            <tr><td>Cookies de análise (se aceitos)</td><td>Navegação</td><td>Entender uso da loja e melhorar a experiência</td><td>Consentimento (I) — revogável no banner</td></tr>
          </tbody>
        </table>
      </div>
      <p>Não tratamos dados pessoais sensíveis (art. 5º, II) nem realizamos decisões automatizadas que produzam efeitos jurídicos sobre você. Não vendemos dados pessoais.</p>

      <h2>4. Cookies e tecnologias semelhantes</h2>
      <ul>
        <li><strong>Essenciais (sempre ativos):</strong> sessão de login, carrinho de compras, preferência de consentimento e proteção contra falsificação de requisições. Sem eles a loja não funciona.</li>
        <li><strong>Análise (opcionais):</strong> só são ativados se você escolher "Aceitar todos" no banner. Você pode mudar a escolha apagando os cookies do navegador, quando o banner reaparecerá.</li>
        <li>Não utilizamos cookies de publicidade comportamental de terceiros.</li>
      </ul>

      <h2>5. Compartilhamento com terceiros (operadores)</h2>
      <p>Compartilhamos dados apenas com quem precisa deles para prestar o serviço, sob contratos e políticas de proteção de dados:</p>
      <ul>
        <li><strong>Mercado Pago</strong> (processamento de pagamentos) — nome, e-mail, valor e itens do pedido.</li>
        <li><strong>Turso / provedor de banco de dados e hospedagem em nuvem</strong> (armazenamento e execução da Plataforma) — todos os dados da conta e do pedido, criptografados em trânsito (TLS) e em repouso.</li>
        <li><strong>Google</strong> — apenas se você optar pelo login com Google.</li>
        <li><strong>Correios e transportadoras</strong> — nome, endereço e telefone para entrega.</li>
        <li><strong>Autoridades públicas</strong>, quando exigido por lei, ordem judicial ou para exercício regular de direitos.</li>
      </ul>
      <p>Alguns desses operadores podem armazenar dados fora do Brasil (transferência internacional, art. 33), sempre com garantias contratuais adequadas e em países com nível de proteção reconhecido ou mediante cláusulas-padrão.</p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Conta:</strong> enquanto ativa. Você pode excluí-la a qualquer momento em "Minha conta" (autoatendimento imediato).</li>
        <li><strong>Pedidos, notas e registros de pagamento:</strong> 5 anos após a compra (Código Civil, art. 206; CDC, art. 27; obrigações fiscais). Após a exclusão da conta, esses registros são <strong>anonimizados</strong> — deixam de identificar você.</li>
        <li><strong>Orçamentos, mensagens e anexos:</strong> enquanto a conta existir ou por até 2 anos após a última interação, salvo pedido de exclusão.</li>
        <li><strong>Logs de acesso e auditoria (IP, data/hora):</strong> mínimo de 6 meses (Marco Civil, art. 15) e até 5 anos para fins de segurança e defesa em processos.</li>
        <li><strong>Registros de consentimento:</strong> pelo tempo da relação e prazo prescricional aplicável.</li>
      </ul>

      <h2>7. Seus direitos como titular (art. 18)</h2>
      <p>Você pode, a qualquer momento e gratuitamente:</p>
      <ul>
        <li>Confirmar a existência de tratamento e <strong>acessar</strong> seus dados;</li>
        <li><strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados;</li>
        <li>Solicitar <strong>anonimização, bloqueio ou eliminação</strong> de dados desnecessários ou tratados em desconformidade;</li>
        <li><strong>Portabilidade</strong> — baixar seus dados em formato legível por máquina (JSON);</li>
        <li><strong>Eliminar</strong> dados tratados com base no consentimento e <strong>revogar</strong> o consentimento;</li>
        <li>Saber com quem compartilhamos seus dados;</li>
        <li>Opor-se a tratamento realizado com base em legítimo interesse;</li>
        <li>Peticionar à <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>.</li>
      </ul>
      <p>
        <strong>Como exercer:</strong> em <Link href="/conta" className="underline">Minha conta → Seus dados (LGPD)</Link> você baixa uma cópia completa e exclui a conta na hora, sem falar com o suporte. Para os demais pedidos, escreva para {p.dpo} ou abra um chamado na <Link href="/ajuda" className="underline">Central de Ajuda</Link> (categoria "Meus dados"). Respondemos em até 15 dias (art. 19). Podemos solicitar comprovação de identidade para proteger você.
      </p>

      <h2>8. Segurança da informação</h2>
      <p>Adotamos medidas técnicas e administrativas proporcionais ao risco (art. 46), inspiradas nos controles do Anexo A da ISO/IEC 27001:</p>
      <ul>
        <li><strong>Controle de acesso e RBAC:</strong> perfis com permissões mínimas (cliente, atendimento, produção, administrador); área administrativa isolada e verificada a cada requisição; bloqueio imediato de contas.</li>
        <li><strong>Autenticação:</strong> senhas com requisitos de força, armazenadas com hash bcrypt (fator 12); sessões assinadas; registro de tentativas de login (sucesso e falha) para detecção de força bruta.</li>
        <li><strong>Criptografia:</strong> TLS em todas as conexões; banco de dados com criptografia em repouso pelo provedor; segredos fora do código-fonte.</li>
        <li><strong>Auditoria e rastreabilidade:</strong> trilha de eventos de clientes, do backoffice e do sistema (quem, o quê, quando, de onde), com retenção definida.</li>
        <li><strong>Minimização e segregação:</strong> dados de cartão nunca passam pelos nossos servidores; anexos e documentos só são acessíveis por quem tem vínculo com o orçamento/chamado.</li>
        <li><strong>Desenvolvimento seguro:</strong> validação de entradas no servidor, proteção contra injeção e CSRF, cabeçalhos de segurança HTTP, dependências atualizadas.</li>
        <li><strong>Gestão de incidentes:</strong> em caso de incidente de segurança que possa acarretar risco ou dano relevante, comunicaremos a ANPD e os titulares afetados em prazo razoável (art. 48), informando natureza, dados envolvidos, medidas adotadas e recomendações.</li>
        <li><strong>Fornecedores:</strong> selecionamos operadores com certificações e políticas de segurança reconhecidas (SOC 2 / ISO 27001) e limitamos o acesso ao necessário.</li>
      </ul>

      <h2>9. Crianças e adolescentes</h2>
      <p>A loja não é direcionada a menores de 18 anos. Compras e cadastros de menores devem ser realizados por responsáveis legais. Se identificarmos dados de menores coletados sem o devido consentimento, eles serão eliminados.</p>

      <h2>10. Links externos</h2>
      <p>Links para sites de terceiros (Mercado Pago, Instagram, WhatsApp, repositórios de modelos 3D) possuem políticas próprias, pelas quais não nos responsabilizamos.</p>

      <h2>11. Alterações desta Política</h2>
      <p>Esta Política pode ser atualizada para refletir mudanças legais, tecnológicas ou de negócio. A versão vigente e sua data estão no topo desta página; mudanças relevantes serão comunicadas e, quando necessário, um novo consentimento será solicitado. O histórico de versões aceitas por você fica visível em "Minha conta".</p>

      <h2>12. Contato</h2>
      <p>
        Encarregado (DPO): <strong>{p.dpo}</strong> · Atendimento: {p.email} · <Link href="/ajuda" className="underline">Central de Ajuda</Link>.
        <br />ANPD: <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer noopener" className="underline">gov.br/anpd</a>.
      </p>

      <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        Documento elaborado conforme a LGPD e referências ISO 27001/27701; recomenda-se revisão jurídica periódica e a manutenção do Registro das Operações de Tratamento (art. 37) e do Relatório de Impacto (RIPD) quando aplicável.
      </p>
    </LegalLayout>
  );
}
