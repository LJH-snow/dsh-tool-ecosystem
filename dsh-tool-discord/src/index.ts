import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DiscordClient, DiscordError, type DiscordClientOptions } from './client.js'

export { DiscordClient, DiscordError }
export type { DiscordClientOptions, DiscordAction, DiscordAuthInfo, DiscordChannelInfo, DiscordGuildInfo, DiscordMemberInfo, DiscordMessageInfo } from './client.js'

export const name = 'dsh-tool-discord'
export const inject = ['tools']

export interface DiscordPluginConfig extends DiscordClientOptions {}

function ownerless(exec: { signal: AbortSignal }): AbortSignal { return exec.signal }
function text(value: string) { return [{ type: 'text' as const, text: value }] }
function unavailable(reason: string) { return { found: false, reason } }
function writeFailure(error: unknown, fallback: string): { ok: false; reason: string } {
  if (error instanceof DiscordError && (error.status === 429 || error.status >= 500)) throw error
  return { ok: false, reason: error instanceof Error ? error.message : fallback }
}
function renderGuilds(items: Array<{ id?: string; name?: string; approximateMemberCount?: number }>) {
  return items.length ? text(items.map(item => item.name + ' (' + item.id + ') members=' + item.approximateMemberCount).join('\n')) : text('No Discord guilds found.')
}
function renderChannels(items: Array<{ id?: string; name?: string; type?: number; topic?: string }>) {
  return items.length ? text(items.map(item => '#' + item.name + ' (' + item.id + ') type=' + item.type + (item.topic ? ' · ' + item.topic : '')).join('\n')) : text('No Discord channels found.')
}
function renderMembers(items: Array<{ id?: string; username?: string; globalName?: string; nick?: string; bot?: boolean }>) {
  return items.length ? text(items.map(item => (item.nick || item.globalName || item.username) + ' (' + item.id + ')' + (item.bot ? ' [bot]' : '')).join('\n')) : text('No Discord members found.')
}
function renderMessages(items: Array<{ id?: string; authorName?: string; content?: string; timestamp?: string }>) {
  return items.length ? text(items.map(item => item.id + ' @' + item.authorName + ' ' + item.timestamp + '\n' + item.content).join('\n\n')) : text('No Discord messages found.')
}

function messageProperties() {
  return {
    id: { type: 'string' }, channelId: { type: 'string' }, authorId: { type: 'string' }, authorName: { type: 'string' },
    content: { type: 'string' }, timestamp: { type: 'string' }, editedTimestamp: { type: 'string' }, replyTo: { type: 'string' },
    threadId: { type: 'string' }, attachments: { type: 'array', items: { type: 'string' } }, embeds: { type: 'array', items: { type: 'string' } },
  } as const
}

/** Build Discord REST tools for a client. */
export function createTools(client: DiscordClient) {
  return [
    defineTool({
      name: 'discord_auth_test',
      description: 'Verify a Discord bot token and return safe identity fields without exposing the token.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, userId: { type: 'string' }, username: { type: 'string' }, discriminator: { type: 'string' }, globalName: { type: 'string' }, bot: { type: 'boolean' } } } as const,
        render: (_args, value) => value.ok ? text('Discord bot: ' + value.username + ' (' + value.userId + ')') : text('Discord auth failed: ' + value.reason),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Verify Discord bot token', kind: 'read' } },
      async execute(_args, exec) {
        if (!client.hasToken()) return { ok: false, reason: 'Discord bot token is not configured.' }
        try { return await client.authTest(exec.signal) } catch (error) {
          if (error instanceof DiscordError && (error.status === 401 || error.status === 403)) return { ok: false, reason: error.message }
          throw error
        }
      },
    }),
    defineTool({
      name: 'discord_list_guilds',
      description: 'List Discord guilds visible to the bot with bounded pagination.',
      parameters: { limit: { type: 'integer', description: 'Results per page, 1-200 (default 100).' }, before: { type: 'string', description: 'Return guilds before this guild id.' }, after: { type: 'string', description: 'Return guilds after this guild id.' }, withCounts: { type: 'boolean', description: 'Include approximate member and presence counts.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, icon: { type: 'string' }, owner: { type: 'boolean' }, permissions: { type: 'string' }, approximateMemberCount: { type: 'integer' }, approximatePresenceCount: { type: 'integer' } } } }, nextBefore: { type: 'string' }, nextAfter: { type: 'string' } } } as const, render: (_args, value) => value.found ? renderGuilds(value.items ?? []) : text(value.reason ?? 'Discord is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Discord guilds (' + String(args.limit ?? 100) + ')', kind: 'search' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); return { found: true, ...await client.listGuilds({ limit: args.limit, before: args.before, after: args.after, withCounts: args.withCounts, signal: ownerless(exec) }) } },
    }),
    defineTool({
      name: 'discord_list_channels',
      description: 'List channels in a Discord guild, including text, forum, voice, category, and thread-capable channel metadata.',
      parameters: { guildId: { type: 'string', required: true, description: 'Discord guild id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, guildId: { type: 'string' }, name: { type: 'string' }, type: { type: 'integer' }, parentId: { type: 'string' }, position: { type: 'integer' }, topic: { type: 'string' }, memberCount: { type: 'integer' } } } } } } as const, render: (_args, value) => value.found ? renderChannels(value.items ?? []) : text(value.reason ?? 'Discord is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Discord channels ' + args.guildId, kind: 'search' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); return { found: true, items: await client.listChannels(args.guildId, ownerless(exec)) } },
    }),
    defineTool({
      name: 'discord_list_members',
      description: 'List guild members with bounded pagination and safe profile fields.',
      parameters: { guildId: { type: 'string', required: true, description: 'Discord guild id.' }, limit: { type: 'integer', description: 'Results per page, 1-1000 (default 100).' }, after: { type: 'string', description: 'Return members after this user id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, username: { type: 'string' }, globalName: { type: 'string' }, nick: { type: 'string' }, bot: { type: 'boolean' }, joinedAt: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } } } } }, nextAfter: { type: 'string' } } } as const, render: (_args, value) => value.found ? renderMembers(value.items ?? []) : text(value.reason ?? 'Discord is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Discord members ' + args.guildId, kind: 'search' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); return { found: true, ...await client.listMembers(args.guildId, { limit: args.limit, after: args.after, signal: ownerless(exec) }) } },
    }),
    defineTool({
      name: 'discord_get_channel',
      description: 'Get one Discord channel by id without returning permission or overwrite internals.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, id: { type: 'string' }, guildId: { type: 'string' }, name: { type: 'string' }, type: { type: 'integer' }, parentId: { type: 'string' }, position: { type: 'integer' }, topic: { type: 'string' }, memberCount: { type: 'integer' } } } as const, render: (_args, value) => value.found ? text('#' + value.name + ' (' + value.id + ')\ntype=' + value.type + '\nguild=' + value.guildId + (value.topic ? '\ntopic=' + value.topic : '')) : text(value.reason ?? 'Discord channel not found.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Discord channel ' + args.channelId, kind: 'read' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); try { return { found: true, ...await client.getChannel(args.channelId, ownerless(exec)) } } catch (error) { if (error instanceof DiscordError && error.status === 404) return { found: false, reason: error.message }; throw error } },
    }),
    defineTool({
      name: 'discord_list_messages',
      description: 'Read recent messages from a Discord channel or thread using one bounded cursor.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel or thread id.' }, limit: { type: 'integer', description: 'Results, 1-100 (default 50).' }, before: { type: 'string', description: 'Messages before this id.' }, after: { type: 'string', description: 'Messages after this id.' }, around: { type: 'string', description: 'Messages around this id; cannot combine with before or after.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: messageProperties() } }, nextBefore: { type: 'string' }, nextAfter: { type: 'string' } } } as const, render: (_args, value) => value.found ? renderMessages(value.items ?? []) : text(value.reason ?? 'Discord is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Discord messages ' + args.channelId, kind: 'search' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); return { found: true, ...await client.listMessages(args.channelId, { limit: args.limit, before: args.before, after: args.after, around: args.around, signal: ownerless(exec) }) } },
    }),
    defineTool({
      name: 'discord_get_message',
      description: 'Read one Discord message by channel and message id.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel or thread id.' }, messageId: { type: 'string', required: true, description: 'Discord message id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, ...messageProperties() } } as const, render: (_args, value) => value.found ? renderMessages([value]) : text(value.reason ?? 'Discord message not found.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Discord message ' + args.messageId, kind: 'read' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); try { return { found: true, ...await client.getMessage(args.channelId, args.messageId, ownerless(exec)) } } catch (error) { if (error instanceof DiscordError && error.status === 404) return { found: false, reason: error.message }; throw error } },
    }),
    defineTool({
      name: 'discord_search_messages',
      description: 'Search messages in a Discord guild by content, author, or channel with a bounded result window.',
      parameters: { guildId: { type: 'string', required: true, description: 'Discord guild id.' }, content: { type: 'string', description: 'Content search text.' }, authorId: { type: 'string', description: 'Filter by author id.' }, channelId: { type: 'string', description: 'Filter by channel id.' }, limit: { type: 'integer', description: 'Results, 1-25 (default 25).' }, offset: { type: 'integer', description: 'Result offset, 0-1000 (default 0).' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, total: { type: 'integer' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: messageProperties() } } } } as const, render: (_args, value) => value.found ? text('total=' + value.total + '\n' + renderMessages(value.items ?? [])[0].text) : text(value.reason ?? 'Discord search unavailable.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Search Discord messages ' + args.guildId, kind: 'search' } },
      async execute(args, exec) { if (!client.hasToken()) return unavailable('Discord bot token is not configured.'); return { found: true, ...await client.searchMessages(args.guildId, { content: args.content, authorId: args.authorId, channelId: args.channelId, limit: args.limit, offset: args.offset, signal: ownerless(exec) }) } },
    }),
    defineTool({
      name: 'discord_send_message',
      description: 'Send a message to a Discord channel. This is an external write operation.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel or thread id.' }, content: { type: 'string', required: true, description: 'Message content, maximum 2000 characters.' }, tts: { type: 'boolean', description: 'Whether Discord should use text-to-speech.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, messageId: { type: 'string' }, channelId: { type: 'string' }, url: { type: 'string' } } } as const, render: (_args, value) => value.ok ? text('Discord message sent: ' + value.messageId) : text('Discord send failed: ' + value.reason) },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Send Discord message to ' + args.channelId, kind: 'edit' } },
      async execute(args, exec) { if (!client.hasToken()) return { ok: false, reason: 'Discord bot token is not configured.' }; try { return await client.sendMessage(args.channelId, { content: args.content, tts: args.tts }, ownerless(exec)) } catch (error) { return writeFailure(error, 'Discord send failed.') } },
    }),
    defineTool({
      name: 'discord_edit_message',
      description: 'Edit a Discord message created by the bot. This is an external write operation.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel or thread id.' }, messageId: { type: 'string', required: true, description: 'Discord message id.' }, content: { type: 'string', required: true, description: 'Replacement content, maximum 2000 characters.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, messageId: { type: 'string' }, channelId: { type: 'string' }, url: { type: 'string' } } } as const, render: (_args, value) => value.ok ? text('Discord message edited: ' + value.messageId) : text('Discord edit failed: ' + value.reason) },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Edit Discord message ' + args.messageId, kind: 'edit' } },
      async execute(args, exec) { if (!client.hasToken()) return { ok: false, reason: 'Discord bot token is not configured.' }; try { return await client.editMessage(args.channelId, args.messageId, args.content, ownerless(exec)) } catch (error) { return writeFailure(error, 'Discord edit failed.') } },
    }),
    defineTool({
      name: 'discord_delete_message',
      description: 'Delete a Discord message. This is an external write operation.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel or thread id.' }, messageId: { type: 'string', required: true, description: 'Discord message id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, messageId: { type: 'string' }, channelId: { type: 'string' } } } as const, render: (_args, value) => value.ok ? text('Discord message deleted: ' + value.messageId) : text('Discord delete failed: ' + value.reason) },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Delete Discord message ' + args.messageId, kind: 'edit' } },
      async execute(args, exec) { if (!client.hasToken()) return { ok: false, reason: 'Discord bot token is not configured.' }; try { return await client.deleteMessage(args.channelId, args.messageId, ownerless(exec)) } catch (error) { return writeFailure(error, 'Discord delete failed.') } },
    }),
    defineTool({
      name: 'discord_react_message',
      description: 'Add or remove the bot reaction on a Discord message. This is an external write operation.',
      parameters: { channelId: { type: 'string', required: true, description: 'Discord channel or thread id.' }, messageId: { type: 'string', required: true, description: 'Discord message id.' }, emoji: { type: 'string', required: true, description: 'Unicode emoji or URL-encoded custom emoji name:id.' }, action: { type: 'string', enum: ['add', 'remove'], description: 'Reaction action (default add).' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, action: { type: 'string' }, emoji: { type: 'string' }, channelId: { type: 'string' }, messageId: { type: 'string' } } } as const, render: (_args, value) => value.ok ? text('Discord reaction ' + value.action + ': ' + value.emoji) : text('Discord reaction failed: ' + value.reason) },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'React to Discord message ' + args.messageId, kind: 'edit' } },
      async execute(args, exec) { if (!client.hasToken()) return { ok: false, reason: 'Discord bot token is not configured.' }; try { return await client.reactMessage(args.channelId, args.messageId, args.emoji, args.action ?? 'add', ownerless(exec)) } catch (error) { return writeFailure(error, 'Discord reaction failed.') } },
    }),
  ]
}

export function apply(ctx: Context, config: DiscordPluginConfig = {}): void {
  const client = new DiscordClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}
