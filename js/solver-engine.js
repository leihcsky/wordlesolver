class WordleSolver {
  constructor(words) {
    this.words = words;
    this.prepareAnalytics();
  }

  prepareAnalytics() {
    // 位置频率统计（0-4位置）
    this.positionStats = Array(5).fill().map(() => new Map());
    // 全局字母频率
    this.globalFreq = new Map();
    
    // 预处理统计
    this.words.forEach(word => {
      const chars = [...word];
      chars.forEach((c, i) => {
        this.positionStats[i].set(c, (this.positionStats[i].get(c) || 0) + 1);
        this.globalFreq.set(c, (this.globalFreq.get(c) || 0) + 1);
      });
    });
  }

  solve(guesses) {
    const constraints = this.analyzeGuesses(guesses);
    let pool = [...this.words];

    // 分阶段过滤
    pool = this.applyGreenConstraints(pool, constraints.greens);
    pool = this.applyYellowConstraints(pool, constraints.yellows);
    pool = this.applyGrayConstraints(pool, constraints.grays);
    
    // 智能排序
    return this.rankSuggestions(pool, constraints);
  }

  analyzeGuesses(guesses) {
    const constraints = {
      greens: new Map(),
      yellows: new Map(),
      grays: new Set(),
      required: new Map()
    };

    guesses.forEach(({ word, states }) => {
      const charRequirements = new Map();

      // 第一遍：收集正向约束
      states.forEach((state, pos) => {
        const c = word[pos];
        if (state === 'correct') {
          constraints.greens.set(pos, c);
          charRequirements.set(c, (charRequirements.get(c) || 0) + 1);
        } else if (state === 'present') {
          if (!constraints.yellows.has(c)) {
            constraints.yellows.set(c, new Set());
          }
          constraints.yellows.get(c).add(pos);
          charRequirements.set(c, (charRequirements.get(c) || 0) + 1);
        }
      });

      // 第二遍：处理反向约束
      states.forEach((state, pos) => {
        const c = word[pos];
        if (state === 'absent') {
          const minRequired = charRequirements.get(c) || 0;
          if (minRequired === 0) {
            constraints.grays.add(c);
          } else {
            constraints.required.set(c,
              Math.max(constraints.required.get(c) || 0, minRequired)
            );
          }
        }
      });
    });

    return constraints;
  }

  applyGreenConstraints(words, greens) {
    return words.filter(word => {
      for (const [pos, c] of greens) {
        if (word[pos] !== c) return false;
      }
      return true;
    });
  }

  applyYellowConstraints(words, yellows) {
    return words.filter(word => {
      for (const [c, forbiddenPos] of yellows) {
        // 必须包含该字母
        if (!word.includes(c)) return false;
        // 不能在禁止的位置出现
        for (const pos of forbiddenPos) {
          if (word[pos] === c) return false;
        }
      }
      return true;
    });
  }

  applyGrayConstraints(words, grays) {
    return words.filter(word => {
      const chars = new Set([...word]);
      for (const c of grays) {
        if (chars.has(c)) return false;
      }
      return true;
    });
  }

  rankSuggestions(candidates, constraints) {
    return candidates.sort((a, b) => {
      const scoreA = this.calculateScore(a, constraints);
      const scoreB = this.calculateScore(b, constraints);
      return scoreB - scoreA; // 降序排列
    });
  }

  calculateScore(word, constraints) {
    let score = 0;
    const charSet = new Set();
    
    [...word].forEach((c, i) => {
      // 位置得分
      score += this.positionStats[i].get(c) || 0;
      // 全局频率得分
      score += (this.globalFreq.get(c) || 0) * 0.3;
      
      // 优化：优先使用未尝试字母
      if (!constraints.grays.has(c) && !charSet.has(c)) {
        score += 50;
      }
      charSet.add(c);
    });

    // 优先包含高频需求字母
    constraints.yellows.forEach((_, c) => {
      if (word.includes(c)) score += 100;
    });

    return score;
  }
}