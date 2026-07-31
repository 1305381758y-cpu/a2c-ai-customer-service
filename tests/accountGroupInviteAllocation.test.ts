import { describe, expect, it } from "vitest";

import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";

describe("客服分组邀请码分配", () => {
  it("同组客服可复用同一邀请码，并只轮询该邀请码绑定的导师", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("分组分配测试");
    const country = repos.ensureDefaultCountry(merchant.id);
    const accounts = repos.syncMerchantA2CAccounts(merchant.id, [
      { apiPhone: "14303103499", verifiedName: "客服一" },
      { apiPhone: "14303103500", verifiedName: "客服二" }
    ]);
    const group = repos.createA2CAccountGroup(merchant.id, { name: "巴西组", countryId: country.id });
    repos.setA2CAccountGroupMembers(group.id, merchant.id, accounts.map((account) => account.id));
    const invite = repos.createGroupInviteCode(group.id, merchant.id, {
      code: "BR-SHARED",
      registerUrl: "https://register.example/?code={code}",
      reusable: true
    });
    const teacherA = repos.createTeacherTgLink(merchant.id, country.id, { label: "导师A", url: "https://t.me/teacher_a", priority: 10, rotationCount: 1 });
    const teacherB = repos.createTeacherTgLink(merchant.id, country.id, { label: "导师B", url: "https://t.me/teacher_b", priority: 10, rotationCount: 1 });
    const unbound = repos.createTeacherTgLink(merchant.id, country.id, { label: "未绑定导师", url: "https://t.me/not_allowed", priority: 99, rotationCount: 10 });
    repos.replaceInviteTeacherBindings("group", invite.id, merchant.id, [teacherA.id, teacherB.id]);

    const first = repos.getOrCreateConversation("customer-1", accounts[0]!.apiPhone, "", merchant.id, country.id, false);
    const second = repos.getOrCreateConversation("customer-2", accounts[1]!.apiPhone, "", merchant.id, country.id, false);
    const firstInvite = repos.reserveInviteCodeForConversation(first);
    const secondInvite = repos.reserveInviteCodeForConversation(second);

    expect(firstInvite).toMatchObject({ id: invite.id, source: "group", code: "BR-SHARED", reusable: true, assignedConversationId: first.id });
    expect(secondInvite).toMatchObject({ id: invite.id, source: "group", code: "BR-SHARED", reusable: true, assignedConversationId: second.id });
    expect(repos.listGroupInviteCodes(group.id, merchant.id)[0]).toMatchObject({ status: "available", usageCount: 2 });

    const firstTeacher = repos.assignTeacherTgLinkForConversation(first);
    const secondTeacher = repos.assignTeacherTgLinkForConversation(second);
    expect([firstTeacher?.id, secondTeacher?.id].sort()).toEqual([teacherA.id, teacherB.id].sort());
    expect(firstTeacher?.id).not.toBe(unbound.id);
    expect(secondTeacher?.id).not.toBe(unbound.id);
    expect(repos.assignTeacherTgLinkForConversation(first)?.id).toBe(firstTeacher?.id);

    repos.markInviteCodeUsedForConversation(first.id, merchant.id, "platform-1");
    repos.markInviteCodeUsedForConversation(second.id, merchant.id, "platform-2");
    expect(repos.listGroupInviteCodes(group.id, merchant.id)[0]).toMatchObject({ status: "available", usageCount: 2 });
  });

  it("一次性分组邀请码只允许一个会话占用", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("一次性邀请码测试");
    const country = repos.ensureDefaultCountry(merchant.id);
    const accounts = repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "a2c-one" }, { apiPhone: "a2c-two" }]);
    const group = repos.createA2CAccountGroup(merchant.id, { name: "一次性组", countryId: country.id });
    repos.setA2CAccountGroupMembers(group.id, merchant.id, accounts.map((account) => account.id));
    repos.createGroupInviteCode(group.id, merchant.id, { code: "ONLY-ONCE", reusable: false });

    const first = repos.getOrCreateConversation("customer-1", "a2c-one", "", merchant.id, country.id, false);
    const second = repos.getOrCreateConversation("customer-2", "a2c-two", "", merchant.id, country.id, false);
    expect(repos.reserveInviteCodeForConversation(first)?.code).toBe("ONLY-ONCE");
    expect(repos.reserveInviteCodeForConversation(second)).toBeUndefined();
    expect(repos.listGroupInviteCodes(group.id, merchant.id)[0]?.status).toBe("reserved");
  });

  it("不同商户和不同分组之间不会串用邀请码或导师绑定", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchantA = repos.createMerchant("商户A");
    const merchantB = repos.createMerchant("商户B");
    const countryA = repos.ensureDefaultCountry(merchantA.id);
    const countryB = repos.ensureDefaultCountry(merchantB.id);
    const accountA = repos.syncMerchantA2CAccounts(merchantA.id, [{ apiPhone: "same-visible-phone" }])[0]!;
    const accountB = repos.syncMerchantA2CAccounts(merchantB.id, [{ apiPhone: "merchant-b-phone" }])[0]!;
    const groupA = repos.createA2CAccountGroup(merchantA.id, { name: "A组", countryId: countryA.id });
    const groupB = repos.createA2CAccountGroup(merchantB.id, { name: "B组", countryId: countryB.id });
    repos.setA2CAccountGroupMembers(groupA.id, merchantA.id, [accountA.id]);
    repos.setA2CAccountGroupMembers(groupB.id, merchantB.id, [accountB.id]);
    repos.createGroupInviteCode(groupA.id, merchantA.id, { code: "A-CODE", reusable: true });
    repos.createGroupInviteCode(groupB.id, merchantB.id, { code: "B-CODE", reusable: true });

    const conversationB = repos.getOrCreateConversation("customer-b", accountB.apiPhone, "", merchantB.id, countryB.id, false);
    expect(repos.reserveInviteCodeForConversation(conversationB)).toMatchObject({ code: "B-CODE", merchantId: merchantB.id });
    expect(() => repos.replaceInviteTeacherBindings("group", 1, merchantB.id, [])).toThrow(/邀请码不存在/);
  });

  it("修改商户默认注册链接后同步继承型国家和邀请码链接", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("默认注册链接同步测试");
    const country = repos.createMerchantCountry(merchant.id, {
      name: "巴西",
      code: "br",
      defaultLanguage: "pt-BR",
      platformRegisterUrl: "https://www.google.com"
    });
    repos.patchMerchantConfig(merchant.id, { platformRegisterUrl: "https://www.google.com" });
    const account = repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "14303103499" }])[0]!;
    const group = repos.createA2CAccountGroup(merchant.id, { name: "巴西组", countryId: country.id });
    repos.setA2CAccountGroupMembers(group.id, merchant.id, [account.id]);
    repos.createGroupInviteCode(group.id, merchant.id, {
      code: "INHERITED",
      registerUrl: "https://www.google.com",
      reusable: true
    });
    repos.createGroupInviteCode(group.id, merchant.id, {
      code: "CUSTOM",
      registerUrl: "https://custom.example/register",
      reusable: true
    });
    repos.createInviteCodeForA2CAccount(account.id, {
      code: "ACCOUNT-INHERITED",
      registerUrl: "https://www.google.com",
      reusable: true
    }, merchant.id);
    repos.createInviteCodeForA2CAccount(account.id, {
      code: "ACCOUNT-CUSTOM",
      registerUrl: "https://account-custom.example/register",
      reusable: true
    }, merchant.id);

    repos.patchMerchantConfig(merchant.id, { platformRegisterUrl: "https://brps.cc/#/register" });

    expect(repos.getMerchantConfig(merchant.id).platformRegisterUrl).toBe("https://brps.cc/#/register");
    expect(repos.getMerchantCountry(country.id)?.platformRegisterUrl).toBe("https://brps.cc/#/register");
    expect(repos.listGroupInviteCodes(group.id, merchant.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INHERITED", registerUrl: "https://brps.cc/#/register" }),
      expect.objectContaining({ code: "CUSTOM", registerUrl: "https://custom.example/register" })
    ]));
    expect(repos.listInviteCodesForA2CAccount(account.id, merchant.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ACCOUNT-INHERITED", registerUrl: "https://brps.cc/#/register" }),
      expect.objectContaining({ code: "ACCOUNT-CUSTOM", registerUrl: "https://account-custom.example/register" })
    ]));
  });

  it("读取旧版本遗留的 Google 占位链接时自动修复", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("历史注册链接修复测试");
    const country = repos.createMerchantCountry(merchant.id, {
      name: "巴西",
      code: "br",
      defaultLanguage: "pt-BR",
      platformRegisterUrl: "https://www.google.com"
    });
    const account = repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "14303103499" }])[0]!;
    const group = repos.createA2CAccountGroup(merchant.id, { name: "巴西组", countryId: country.id });
    repos.createGroupInviteCode(group.id, merchant.id, {
      code: "LEGACY",
      registerUrl: "https://www.google.com",
      reusable: true
    });
    db.sqlite.prepare(`
      UPDATE merchant_configs
      SET platform_register_url = ?, updated_at = datetime('now', '+1 second')
      WHERE merchant_id = ?
    `).run("https://brps.cc/#/register", merchant.id);

    expect(repos.getMerchantConfig(merchant.id).platformRegisterUrl).toBe("https://brps.cc/#/register");
    expect(repos.getMerchantCountry(country.id)?.platformRegisterUrl).toBe("https://brps.cc/#/register");
    expect(repos.listGroupInviteCodes(group.id, merchant.id)[0]?.registerUrl).toBe("https://brps.cc/#/register");
  });
});
