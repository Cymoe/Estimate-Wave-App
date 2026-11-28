import { describe, expect, test } from "vitest";
import { operatorGroups, operatorName, personKey, type OperatorOwner } from "./lib/operators";

const owner = (id: string, name: string, over: Partial<OperatorOwner> = {}): OperatorOwner => ({ id, name, company: true, phones: [], emails: [], ...over });
/** The groups as lists of ids, with what ties each. */
const groupsOf = (owners: OperatorOwner[]) => [...new Set(operatorGroups(owners).values())].map((g) => ({ ids: g.ids, ties: g.ties, person: g.person }));

describe("the person behind an owner", () => {
  test("a name is compared by its first and last words, whatever the order, initials or suffix", () => {
    expect(personKey("Dana Reyes")).toBe("DANA REYES");
    expect(personKey("Dana M. Reyes")).toBe("DANA REYES");
    expect(personKey("REYES, DANA M")).toBe("DANA REYES");
    expect(personKey("Dana Reyes Jr.")).toBe("DANA REYES");
    // One word is not a name to match on.
    expect(personKey("Reyes")).toBeUndefined();
    expect(personKey(undefined)).toBeUndefined();
  });

  test("a registered agent standing in for the decision maker ties nobody", () => {
    expect(operatorName({ name: "Karen Holt", title: "General partner" })).toBe("Karen Holt");
    expect(operatorName({ name: "Lex Filer", title: "Registered agent" })).toBeUndefined();
    expect(
      groupsOf([
        owner("a", "Bluebonnet Holdings LLC", { person: operatorName({ name: "Lex Filer", title: "Registered agent" }) }),
        owner("b", "Permian Storage LP", { person: operatorName({ name: "Lex Filer", title: "Registered agent" }) }),
      ]),
    ).toEqual([]);
  });

  test("companies naming one decision maker at one mailing address are one group; the name alone ties nobody", () => {
    const office = "100 WALL ST|79701";
    const groups = operatorGroups([
      owner("a", "Bluebonnet Holdings LLC", { person: "Karen Holt", mailing: office }),
      owner("b", "Permian Storage LP", { person: "HOLT, KAREN A", mailing: office }),
      owner("c", "Wall Street Lofts LLC", { person: "Karen Holt", mailing: office }),
      // The same name with nothing else in common: another Karen Holt, for all anyone can tell.
      owner("f", "Loop 250 Storage LLC", { person: "Karen Holt", mailing: "9 ELM ST|79761" }),
      owner("g", "Garfield Commons LLC", { person: "Karen Holt" }),
      owner("d", "Big Spring Plaza LLC", { person: "Sam Ortiz", mailing: office }),
      owner("e", "Tall City Towers LLC"),
    ]);
    expect(groups.get("a")).toEqual({ key: "a", ids: ["a", "b", "c"], ties: ["person"], person: "Karen Holt" });
    expect(groups.get("b")).toBe(groups.get("a"));
    expect(groups.get("c")).toBe(groups.get("a"));
    expect(groups.get("f")).toBeUndefined();
    expect(groups.get("g")).toBeUndefined();
    // One address is not enough either without the name: a shared office building.
    expect(groups.get("d")).toBeUndefined();
    expect(groups.get("e")).toBeUndefined();
    // Two companies and nothing but a name: no group at all.
    expect(groupsOf([owner("a", "Bluebonnet Holdings LLC", { person: "David Martinez" }), owner("b", "Permian Storage LP", { person: "David Martinez" })])).toEqual([]);
  });

  test("the group's key is the same in whatever order its owners come", () => {
    const a = owner("a", "Bluebonnet Holdings LLC", { person: "Karen Holt", mailing: "100 WALL ST|79701" });
    const b = owner("b", "Permian Storage LP", { person: "Karen Holt", mailing: "100 WALL ST|79701" });
    expect(operatorGroups([a, b]).get("a")!.key).toBe("a");
    expect(operatorGroups([b, a]).get("a")!.key).toBe("a");
    expect(operatorGroups([b, a]).get("a")!.ids).toEqual(["b", "a"]);
  });

  test("a shared phone or email ties owners with no name in common to go by", () => {
    expect(
      groupsOf([
        owner("a", "Ortega Rentals LLC", { person: "Luis Ortega", phones: ["(432) 555-0104"] }),
        // No decision maker found for this one, but it answers the same line.
        owner("b", "Big Spring Plaza LLC", { phones: ["4325550104"] }),
        // A person owning in their own name, at the same email as their company.
        owner("c", "Tall City Towers LLC", { emails: ["Pat@Towers.example"] }),
        owner("d", "Pat Vance", { company: false, emails: ["pat@towers.example"] }),
      ]),
    ).toEqual([
      { ids: ["a", "b"], ties: ["phone"], person: "Luis Ortega" },
      { ids: ["c", "d"], ties: ["email"], person: undefined },
    ]);
  });

  test("a line shared by people known to be different (a front desk) ties only those of one name", () => {
    expect(
      groupsOf([
        owner("a", "Ortega Rentals LLC", { person: "Luis Ortega", phones: ["4325550100"] }),
        owner("b", "Big Spring Plaza LLC", { person: "Luis Ortega", phones: ["4325550100"] }),
        owner("c", "Tall City Towers LLC", { person: "Karen Holt", phones: ["4325550100"] }),
        // Nobody named: there is no telling whose line it is, so it stays out.
        owner("d", "Wall Street Lofts LLC", { phones: ["4325550100"] }),
      ]),
    ).toEqual([{ ids: ["a", "b"], ties: ["person", "phone"], person: "Luis Ortega" }]);
  });

  test("two people of one name: only what they have in common besides the name ties them, before lookups and after", () => {
    const nuka = (id: string, name: string, over: Partial<OperatorOwner> = {}) => owner(id, name, { person: "Kai Moana", mailing: "1 MAIN ST|79701", ...over });
    // Before any lookup: the two at one address are one person; the one at another address is not taken for him.
    expect(groupsOf([nuka("a", "Tradewind Rentals LLC"), nuka("b", "Loraine Lofts LP"), owner("c", "Brazos Storage LLC", { person: "Kai Moana", mailing: "9 ELM ST|79761" })])).toEqual([
      { ids: ["a", "b"], ties: ["person"], person: "Kai Moana" },
    ]);
    // The lookups turn up one man's number at one office and another's at the other: two people.
    expect(
      groupsOf([
        nuka("a", "Tradewind Rentals LLC", { phones: ["4325550142"] }),
        nuka("b", "Loraine Lofts LP"),
        owner("c", "Brazos Storage LLC", { person: "Kai Moana", mailing: "9 ELM ST|79761", phones: ["5125550177"] }),
      ]),
    ).toEqual([{ ids: ["a", "b"], ties: ["person"], person: "Kai Moana" }]);
    // The same number at both addresses says one person after all.
    expect(
      groupsOf([nuka("a", "Tradewind Rentals LLC", { phones: ["4325550142"] }), owner("c", "Brazos Storage LLC", { person: "Kai Moana", mailing: "9 ELM ST|79761", phones: ["4325550142", "5125550177"] })]),
    ).toEqual([{ ids: ["a", "c"], ties: ["person", "phone"], person: "Kai Moana" }]);
  });

  test("a family of companies is one group, named for the decision maker most of them give", () => {
    expect(
      groupsOf([
        owner("a", "Nuka Hiva Alpha 1-54 LLC", { person: "Kai Moana" }),
        owner("b", "Nuka Hiva Alpha 55-106 LLC"),
        owner("c", "Nuka Hiva Alpha LLC", { person: "Kai Moana" }),
        // A person of the same name as a company's decision maker is not tied by the name: only companies are.
        owner("d", "Kai Moana", { company: false }),
      ]),
    ).toEqual([{ ids: ["a", "b", "c"], ties: ["family"], person: "Kai Moana" }]);
  });
});
