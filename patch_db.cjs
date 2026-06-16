const fs = require('fs');
const file = 'backend/src/db.ts';
let content = fs.readFileSync(file, 'utf8');

// Patch JsonDbAdapter interface
content = content.replace(
  `    transactions: DbCashTransaction[];\n    bakeryBatches: DbBakeryBatch[];\n  } = {`,
  `    transactions: DbCashTransaction[];\n    bakeryBatches: DbBakeryBatch[];\n    dailyClosures: DbDailyClosure[];\n  } = {`
);

content = content.replace(
  `    transactions: [],\n    bakeryBatches: []\n  };`,
  `    transactions: [],\n    bakeryBatches: [],\n    dailyClosures: []\n  };`
);

content = content.replace(
  `    if (!this.data.bakeryBatches) {\n      this.data.bakeryBatches = [];\n    }\n\n    await this.save();`,
  `    if (!this.data.bakeryBatches) {\n      this.data.bakeryBatches = [];\n    }\n    if (!this.data.dailyClosures) {\n      this.data.dailyClosures = [];\n    }\n\n    await this.save();`
);

content = content.replace(
  `  async addBakeryBatch(batch: DbBakeryBatch): Promise<void> {\n    await this.read();\n    if (!this.data.bakeryBatches) this.data.bakeryBatches = [];\n    \n    const newBatch = {\n      ...batch,\n      id: this.data.bakeryBatches.length + 1\n    };\n    this.data.bakeryBatches.push(newBatch);\n    await this.save();\n  }`,
  `  async addBakeryBatch(batch: DbBakeryBatch): Promise<void> {\n    await this.read();\n    if (!this.data.bakeryBatches) this.data.bakeryBatches = [];\n    \n    const newBatch = {\n      ...batch,\n      id: this.data.bakeryBatches.length + 1\n    };\n    this.data.bakeryBatches.push(newBatch);\n    await this.save();\n  }\n\n  async getDailyClosures(): Promise<DbDailyClosure[]> {\n    await this.read();\n    return this.data.dailyClosures || [];\n  }\n\n  async createDailyClosure(closure: DbDailyClosure): Promise<void> {\n    await this.read();\n    if (!this.data.dailyClosures) this.data.dailyClosures = [];\n    this.data.dailyClosures.push(closure);\n    await this.save();\n  }`
);

fs.writeFileSync(file, content);
