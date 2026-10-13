import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { TERMS_VERSION } from "@/lib/security";
import { LegalLayout, legalParty } from "@/components/store/legal";

export const metadata = { title: "Termos de Uso" };

export default async function TermsPage() {
  const s = await getSettings();
  const p = legalParty(s);
  return (
    <LegalLayout title="Termos de Uso" version={TERMS_VERSION}>
      <p>
        Estes Termos de Uso ("Termos") regulam o acesso e a utilização do site e da loja virtual <strong>{p.brand}</strong> ("Plataforma"), operada por{" "}
        <strong>{p.name}</strong>, inscrita no CNPJ/CPF sob o nº <strong>{p.doc}</strong>, com endereço em <strong>{p.address}</strong>, e-mail de contato <strong>{p.email}</strong> ("Loja", "nós").
        Ao navegar, criar conta, solicitar orçamento ou realizar uma compra, você ("Cliente", "você") declara ter lido, compreendido e aceito integralmente estes Termos e a nossa{" "}
        <Link href="/privacidade" className="underline">Política de Privacidade</Link>. Se não concordar, não utilize a Plataforma.
      </p>
      <p>
        Estes Termos observam o Código de Defesa do Consumidor (Lei 8.078/1990), o Decreto do Comércio Eletrônico (Decreto 7.962/2013), o Marco Civil da Internet (Lei 12.965/2014), a Lei Geral de Proteção de Dados Pessoais — LGPD (Lei 13.709/2018) e o Código Civil (Lei 10.406/2002).
      </p>

      <h2>1. Definições</h2>
      <ul>
        <li><strong>Produto de catálogo:</strong> peça padronizada, exibida com preço, pronta ou produzida sob demanda após o pedido.</li>
        <li><strong>Projeto personalizado:</strong> peça desenvolvida a partir de especificações, referências ou arquivos fornecidos por você, mediante orçamento prévio e aprovação.</li>
        <li><strong>Orçamento:</strong> proposta comercial com preço, prazo e condições para um projeto personalizado, com validade indicada.</li>
        <li><strong>Pedido:</strong> contrato de compra formado com a confirmação no checkout e o pagamento aprovado.</li>
      </ul>

      <h2>2. Cadastro e conta</h2>
      <ol>
        <li>Para comprar itens personalizados, acompanhar pedidos e abrir chamados você pode criar uma conta com e-mail e senha ou com sua conta Google. Compras de catálogo podem ser feitas como visitante.</li>
        <li>Você é responsável pela veracidade dos dados informados e pela guarda da sua senha. Exigimos senha forte e recomendamos não reutilizá-la em outros serviços. Comunique-nos imediatamente qualquer uso não autorizado.</li>
        <li>O cadastro é permitido a pessoas maiores de 18 anos ou menores devidamente representados/assistidos pelos responsáveis legais.</li>
        <li>Podemos suspender ou encerrar contas utilizadas em fraude, abuso, violação destes Termos ou da lei, preservando os registros exigidos legalmente.</li>
      </ol>

      <h2>3. Produtos, preços e disponibilidade</h2>
      <ol>
        <li>Preços são expressos em reais (BRL) e incluem os tributos incidentes, salvo indicação. Frete e eventuais serviços adicionais são informados antes da confirmação do pedido.</li>
        <li>Imagens e vídeos são ilustrativos. Peças impressas em 3D podem apresentar variações naturais de cor, textura de camadas e pequenas diferenças dimensionais (tolerância usual de ±0,5 mm), inerentes ao processo de manufatura aditiva, que não configuram defeito.</li>
        <li>Em caso de erro evidente de preço ou indisponibilidade após o pedido, entraremos em contato para oferecer a correção, um item equivalente ou o cancelamento com estorno integral.</li>
        <li>Itens marcados como "sob encomenda" ou "sob orçamento" são produzidos após a confirmação, com o prazo de produção indicado na página ou na proposta.</li>
      </ol>

      <h2>4. Projetos personalizados e propriedade intelectual</h2>
      <ol>
        <li>Ao enviar referências, imagens, textos ou arquivos 3D (STL, 3MF, OBJ etc.), você declara possuir os direitos necessários ou autorização para sua utilização e assume a responsabilidade por eventuais violações de direitos de terceiros (direitos autorais, marcas, desenhos industriais, direitos de imagem).</li>
        <li>Reservamo-nos o direito de recusar projetos que violem a lei, direitos de terceiros, envolvam armas ou suas peças, ou que contrariem nossos valores.</li>
        <li>Os arquivos enviados são utilizados exclusivamente para a execução do seu pedido e não são revendidos, publicados ou reutilizados sem sua autorização. Modelos criados pela Loja a partir do seu briefing permanecem de titularidade da Loja, sendo concedida a você licença de uso das peças físicas adquiridas; a cessão do arquivo digital, se desejada, deve ser negociada e constar do orçamento.</li>
        <li>O orçamento tem a validade nele indicada. A aprovação se dá pela inclusão do item no carrinho e conclusão do pagamento, momento em que a produção é iniciada.</li>
        <li>Alterações de especificação após a aprovação podem implicar novo orçamento e prazo.</li>
      </ol>

      <h2>5. Pedido, pagamento e confirmação</h2>
      <ol>
        <li>O pedido é confirmado após a aprovação do pagamento. Os meios aceitos são PIX, cartão de crédito e boleto, processados pelo <strong>Mercado Pago</strong>, ou PIX direto com confirmação manual quando indicado. Não armazenamos dados de cartão.</li>
        <li>Pedidos com pagamento não aprovado em até 3 dias (ou conforme prazo do boleto) podem ser cancelados automaticamente.</li>
        <li>Você receberá a confirmação e o acompanhamento na página do pedido e, quando cadastrado, em "Minha conta".</li>
        <li>Em caso de suspeita de fraude, podemos solicitar informações adicionais ou cancelar o pedido com estorno.</li>
      </ol>

      <h2>6. Prazos, entrega e retirada</h2>
      <ol>
        <li>O prazo total é a soma do prazo de produção (indicado no produto/orçamento) e do prazo de entrega da modalidade escolhida (retirada, entrega local ou Correios). Prazos são estimativas em dias úteis.</li>
        <li>O risco pela mercadoria transfere-se na entrega ao destinatário ou na retirada. Confira a embalagem no ato do recebimento e registre avarias com o transportador.</li>
        <li>Endereço incorreto informado pelo Cliente, ausência de recebedor ou recusa injustificada podem gerar novo frete para reenvio.</li>
        <li>Itens para retirada ficam disponíveis por 30 dias após o aviso; após esse prazo, entraremos em contato para definir a destinação, podendo incidir taxa de armazenamento.</li>
      </ol>

      <h2>7. Direito de arrependimento, trocas e devoluções</h2>
      <ol>
        <li><strong>Produtos de catálogo:</strong> você pode desistir da compra em até 7 (sete) dias corridos a contar do recebimento (CDC, art. 49), sem necessidade de justificativa, com devolução integral dos valores pagos, incluindo frete. O item deve ser devolvido sem sinais de uso, na embalagem original; o custo de envio da devolução por arrependimento é da Loja.</li>
        <li><strong>Projetos personalizados e itens produzidos sob especificação do Cliente:</strong> por serem confeccionados exclusivamente para você e sem valor de revenda, o cancelamento sem ônus é possível até o <strong>início da produção</strong>. Após iniciada, aplicam-se a garantia legal contra vícios (item 8) e, a nosso critério, cancelamento com retenção dos custos já incorridos (material e tempo de máquina), devidamente demonstrados.</li>
        <li>Solicitações devem ser feitas pela Central de Ajuda (chamado), WhatsApp ou e-mail, informando o número do pedido.</li>
        <li>Estornos são processados pelo mesmo meio de pagamento em até 10 dias úteis após o recebimento do item devolvido (ou da aprovação do cancelamento); no cartão, o crédito pode aparecer em até 2 faturas, conforme a operadora.</li>
      </ol>

      <h2>8. Garantia legal e defeitos</h2>
      <ol>
        <li>Os produtos possuem garantia legal de 30 (trinta) dias para bens não duráveis e 90 (noventa) dias para bens duráveis, contados da entrega (CDC, art. 26), contra vícios de fabricação: quebra por delaminação, falha de encaixe em relação ao especificado, dimensões fora da tolerância informada.</li>
        <li>Não são cobertos: desgaste natural, mau uso, exposição a calor excessivo (PLA amolece a partir de ~55 °C), sol direto prolongado, esforço acima do indicado, modificações ou pintura feitas pelo Cliente, e características inerentes ao processo (item 3.2).</li>
        <li>Constatado o vício, providenciaremos, em até 30 dias, a reimpressão da peça, a devolução do valor pago ou o abatimento proporcional, à sua escolha (CDC, art. 18, §1º).</li>
      </ol>

      <h2>9. Conduta do Cliente</h2>
      <p>É vedado utilizar a Plataforma para fins ilícitos; tentar acessar áreas restritas, contas de terceiros ou dados que não lhe pertençam; interferir no funcionamento do site; enviar conteúdo ofensivo, ilegal ou que viole direitos de terceiros; ou realizar engenharia reversa da Plataforma. Registramos endereços IP e eventos de uso para segurança e prevenção a fraudes.</p>

      <h2>10. Propriedade intelectual da Plataforma</h2>
      <p>Marca, identidade visual, textos, fotos, vídeos, modelos e código da Plataforma pertencem à Loja ou a seus licenciantes e são protegidos pela legislação de propriedade intelectual. É proibida a reprodução sem autorização, exceto para uso pessoal e não comercial de visualização.</p>

      <h2>11. Dados pessoais e cookies</h2>
      <p>O tratamento dos seus dados pessoais segue a <Link href="/privacidade" className="underline">Política de Privacidade</Link>, que integra estes Termos. Registramos o aceite destes Termos (versão, data/hora, e-mail e IP) para fins de prova. Você pode gerenciar cookies não essenciais pelo banner de consentimento e exercer seus direitos de titular em "Minha conta".</p>

      <h2>12. Comunicações</h2>
      <p>Você concorda em receber comunicações transacionais (confirmação, status do pedido, respostas a orçamentos e chamados) por e-mail, WhatsApp ou pela própria Plataforma. Comunicações promocionais dependem do seu consentimento e podem ser canceladas a qualquer momento.</p>

      <h2>13. Limitação de responsabilidade</h2>
      <ol>
        <li>A Plataforma é fornecida "como está"; envidamos esforços razoáveis para mantê-la disponível e segura, mas não garantimos operação ininterrupta.</li>
        <li>Não nos responsabilizamos por danos decorrentes de uso das peças em desacordo com sua finalidade ou com as orientações fornecidas, nem por conteúdo enviado pelo Cliente.</li>
        <li>Nada nestes Termos exclui ou limita direitos do consumidor que não possam ser afastados por lei.</li>
      </ol>

      <h2>14. Atendimento e solução de conflitos</h2>
      <p>
        Nosso atendimento é feito pela <Link href="/ajuda" className="underline">Central de Ajuda</Link> (chamados com histórico e anexos), WhatsApp e e-mail {p.email}. Buscamos resolver qualquer questão de forma amigável; você também pode recorrer ao Procon e à plataforma <a href="https://www.consumidor.gov.br" target="_blank" rel="noreferrer noopener" className="underline">consumidor.gov.br</a>.
        Fica eleito o foro do domicílio do consumidor para dirimir controvérsias, conforme o CDC; nas relações não consumeristas, o foro da comarca de {p.city}/{p.state}.
      </p>

      <h2>15. Alterações</h2>
      <p>Podemos atualizar estes Termos para refletir mudanças legais ou operacionais. A versão vigente estará sempre nesta página, com data e número de versão; alterações relevantes serão comunicadas e, quando exigido, um novo aceite será solicitado. Pedidos já realizados seguem os Termos vigentes na data da compra.</p>

      <h2>16. Disposições gerais</h2>
      <p>A eventual invalidade de uma cláusula não afeta as demais. A tolerância quanto ao descumprimento não implica renúncia. Estes Termos são regidos pelas leis da República Federativa do Brasil.</p>

      <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        Este documento foi elaborado com base na legislação brasileira aplicável ao comércio eletrônico e à proteção de dados, mas não substitui a revisão por advogado(a) para a realidade específica do seu negócio (regime tributário, emissão de nota fiscal, seguros, contratos com terceiros).
      </p>
    </LegalLayout>
  );
}
