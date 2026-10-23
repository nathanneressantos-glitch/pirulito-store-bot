
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const products = [
  { name: "FFlags", value: "fflags" },
  { name: "Otimizações", value: "otimizacoes" },
  { name: "Corpos", value: "corpos" },
  { name: "Contas", value: "contas" },
  { name: "Seja VIP", value: "vip" },
  { name: "Seja Vendedor", value: "vendedor" }
];

const prices = new Map();
const stock = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica o painel de compras")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("preco")
    .setDescription("Define o preço de um produto")
    .addStringOption(o =>
      o.setName("produto")
        .setDescription("Produto")
        .setRequired(true)
        .addChoices(...products.map(p => ({
          name: p.name,
          value: p.value
        }))))
    .addNumberOption(o =>
      o.setName("valor")
        .setDescription("Preço em reais")
        .setMinValue(0)
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("estoque")
    .setDescription("Adiciona item ao estoque")
    .addStringOption(o =>
      o.setName("produto")
        .setDescription("Produto")
        .setRequired(true)
        .addChoices(...products.slice(0, 4).map(p => ({
          name: p.name,
          value: p.value
        }))))
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Conteúdo para entregar")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

function money(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

client.once("ready", async () => {
  console.log(`🍬 Pirulito Store online: ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error.message);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "painel") {
        const embed = new EmbedBuilder()
          .setTitle("🍬 Pirulito Store")
          .setDescription(
            "Selecione abaixo o produto que deseja comprar.\n\n" +
            products.map(p =>
              `**${p.name}** — ${
                prices.has(p.value)
                  ? money(prices.get(p.value))
                  : "Preço a consultar"
              }`
            ).join("\n")
          )
          .setColor(0x5865F2);

        const menu = new StringSelectMenuBuilder()
          .setCustomId("produto")
          .setPlaceholder("Escolha seu produto")
          .addOptions(products.map(p => ({
            label: p.name,
            value: p.value
          })));

        return interaction.reply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(menu)
          ]
        });
      }

      if (interaction.commandName === "preco") {
        const produto = interaction.options.getString("produto");
        const valor = interaction.options.getNumber("valor");

        prices.set(produto, valor);

        return interaction.reply({
          content: `Preço atualizado: **${money(valor)}**.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "estoque") {
        const produto = interaction.options.getString("produto");
        const item = interaction.options.getString("item");

        if (!stock.has(produto)) stock.set(produto, []);
        stock.get(produto).push(item);

        return interaction.reply({
          content: "Item adicionado ao estoque!",
          ephemeral: true
        });
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "produto"
    ) {
      await interaction.deferReply({ ephemeral: true });

      const product = products.find(
        p => p.value === interaction.values[0]
      );

      const channel = await interaction.guild.channels.create({
        name: `pedido-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      const embed = new EmbedBuilder()
        .setTitle("🛒 Pedido — Pirulito Store")
        .setDescription(
          `**Cliente:** ${interaction.user}\n` +
          `**Produto:** ${product.name}\n` +
          `**Valor:** ${
            prices.has(product.value)
              ? money(prices.get(product.value))
              : "A confirmar"
          }\n\n` +
          "Aguarde um administrador informar os dados do Pix " +
          "e confirmar seu pagamento."
        )
        .setColor(0xF1C40F);

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fechar")
          .setLabel("Fechar pedido")
          .setStyle(ButtonStyle.Secondary)
      );

      await channel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [buttons]
      });

      return interaction.editReply({
        content: `Seu ticket foi criado: ${channel}`
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId === "fechar"
    ) {
      const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      );

      const isTicketOwner =
        interaction.channel.permissionOverwrites.cache.has(
          interaction.user.id
        );

      if (!isAdmin && !isTicketOwner) {
        return interaction.reply({
          content: "Você não pode fechar este ticket.",
          ephemeral: true
        });
      }

      await interaction.reply("Este ticket será fechado.");
      await interaction.channel.delete().catch(() => {});
    }
  } catch (error) {
    console.error(error);

    const message = "Não consegui completar essa ação. Confira as permissões.";
    if (interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred) {
      await interaction.reply({
        content: message,
        ephemeral: true
      }).catch(() => {});
    }
  }
});

if (
  !process.env.DISCORD_TOKEN ||
  !process.env.CLIENT_ID ||
  !process.env.GUILD_ID
) {
  console.error("Faltam variáveis de ambiente do Discord.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
